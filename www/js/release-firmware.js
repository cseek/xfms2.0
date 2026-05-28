/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:35:21
 * @Description: 发布固件页面脚本，负责处理用户输入的固件信息和文件，进行表单验证，调用后端 API 发布固件，并提供多语言支持和权限控制，确保只有管理员或开发者可以发布固件
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */

(function() {
    'use strict';
    
    let currentLang = localStorage.getItem('firmwareLang') || 'zh';
    let selectedFile = null;
    let uploadTask = {
        xhr: null,
        payload: null,
        state: 'idle',
        loadedBytes: 0,
        totalBytes: 0,
        cancelRequested: false
    };

    async function init() {
        await loadData();
        applyLanguage(currentLang);
        updateProjectSelects();
        setupEventListeners();
        // 权限控制：仅管理员或开发者允许发布固件
        let canPublish = false;
        try {
            const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
            canPublish = cu && (cu.role === '管理员' || cu.role === '开发者');
        } catch (e) { canPublish = false; }
        setPublishPermissions(canPublish);
    }

    async function loadData() {
        await DataManager.loadData();
    }

    function setupEventListeners() {
        document.getElementById('releaseFirmwareProject').addEventListener('change', updateModuleSelect);
        
        const fileUploadArea = document.getElementById('fileUploadArea');
        const firmwareFile = document.getElementById('firmwareFile');
        
        fileUploadArea.addEventListener('click', () => firmwareFile.click());
        
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('dragover');
        });
        
        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.classList.remove('dragover');
        });
        
        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFileSelect(files[0]);
        });
        
        firmwareFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
        });
        
        document.getElementById('clearFileBtn').addEventListener('click', (e) => {
            e.preventDefault();
            clearFile();
        });
        
        document.getElementById('releaseFirmwareForm').addEventListener('submit', (e) => {
            e.preventDefault();
            publishFirmware();
        });
        
        document.getElementById('resetBtn').addEventListener('click', (e) => {
            e.preventDefault();
            resetForm();
        });

        const cancelBtn = document.getElementById('uploadCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', cancelUpload);
    }

    function getUploadUI() {
        return {
            toast: document.getElementById('uploadProgressToast'),
            ringBar: document.getElementById('uploadRingBar'),
            titleText: document.getElementById('uploadProgressTitle'),
            subText: document.getElementById('uploadProgressSub'),
            publishBtn: document.getElementById('publishBtn'),
            resetBtn: document.getElementById('resetBtn')
        };
    }

    function setMainActionDisabled(disabled) {
        const ui = getUploadUI();
        if (ui.publishBtn) ui.publishBtn.disabled = disabled;
        if (ui.resetBtn) ui.resetBtn.disabled = disabled;
    }

    function initUploadToast(title) {
        const ui = getUploadUI();
        if (!ui.toast || !ui.ringBar) return;
        ui.ringBar.style.transition = 'none';
        ui.ringBar.style.strokeDasharray = '40 73.1';
        ui.ringBar.style.strokeDashoffset = '0';
        ui.ringBar.style.animation = 'downloadRingSpin 0.9s linear infinite';
        if (ui.titleText) ui.titleText.textContent = title || '正在上传...';
        if (ui.subText) ui.subText.textContent = '';
        ui.toast.style.display = 'flex';
    }

    function resetUploadTask(hideToast) {
        const ui = getUploadUI();
        if (hideToast && ui.toast) ui.toast.style.display = 'none';
        uploadTask.xhr = null;
        uploadTask.payload = null;
        uploadTask.state = 'idle';
        uploadTask.loadedBytes = 0;
        uploadTask.totalBytes = 0;
        uploadTask.cancelRequested = false;
    }

    function cancelUpload() {
        if (uploadTask.state === 'uploading' && uploadTask.xhr) {
            uploadTask.cancelRequested = true;
            uploadTask.xhr.abort();
            return;
        }
        resetUploadTask(true);
        setMainActionDisabled(false);
    }

    async function doUpload(payload) {
        const RING_C = 113.1;
        const ui = getUploadUI();

        uploadTask.state = 'uploading';
        uploadTask.cancelRequested = false;
        uploadTask.payload = payload;
        uploadTask.loadedBytes = 0;
        uploadTask.totalBytes = payload.file ? payload.file.size : 0;

        initUploadToast('正在上传...');
        setMainActionDisabled(true);

        const formData = new FormData();
        formData.append('project_id', payload.projectId);
        formData.append('module_id', payload.moduleId);
        formData.append('version', payload.version);
        formData.append('description', payload.description);
        formData.append('status', 'pending');
        formData.append('maxFileSize', getMaxFileSizeBytes());
        formData.append('file', payload.file);

        const result = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            uploadTask.xhr = xhr;

            const token = localStorage.getItem('authToken');
            xhr.open('POST', '/api/firmware');
            if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && e.total > 0) {
                    uploadTask.loadedBytes = e.loaded;
                    uploadTask.totalBytes = e.total;
                    const pct = Math.round(e.loaded / e.total * 100);
                    ui.ringBar.style.animation = 'none';
                    ui.ringBar.style.strokeDasharray = '113.1';
                    ui.ringBar.style.transition = 'stroke-dashoffset 0.25s ease';
                    ui.ringBar.style.strokeDashoffset = RING_C * (1 - pct / 100);
                    const loaded = (e.loaded / 1024 / 1024).toFixed(1);
                    const total  = (e.total  / 1024 / 1024).toFixed(1);
                    if (ui.subText) ui.subText.textContent = pct + '%  (' + loaded + ' / ' + total + ' MB)';
                }
            });

            xhr.addEventListener('load', () => {
                let json = null;
                try { json = JSON.parse(xhr.responseText); } catch (e) { json = null; }
                if (xhr.status === 401 || (json && json.code === 401)) {
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('authToken');
                    window.top.location.replace('/login.html');
                    reject(new Error('未登录'));
                    return;
                }
                if (xhr.status >= 400 || (json && json.code >= 400)) {
                    reject(new Error((json && json.message) || '请求失败'));
                    return;
                }

                ui.ringBar.style.animation = 'none';
                ui.ringBar.style.strokeDasharray = '113.1';
                ui.ringBar.style.transition = 'stroke-dashoffset 0.2s ease';
                ui.ringBar.style.strokeDashoffset = '0';
                if (ui.subText) ui.subText.textContent = '100%';

                setTimeout(() => resolve((json && json.data) || null), 400);
            });

            xhr.addEventListener('abort', () => {
                if (uploadTask.cancelRequested) {
                    resetUploadTask(true);
                    setMainActionDisabled(false);
                    reject(new Error('__UPLOAD_CANCELED__'));
                    return;
                }
                reject(new Error('上传已中断'));
            });

            xhr.addEventListener('error', () => reject(new Error('网络错误')));
            xhr.send(formData);
        });

        if (ui.toast) ui.toast.style.display = 'none';
        setMainActionDisabled(false);
        resetUploadTask(false);
        return result;
    }

    function updateProjectSelects() {
        const trans = translations[currentLang];
        const projectSelect = document.getElementById('releaseFirmwareProject');
        projectSelect.innerHTML = `<option value="">${trans.selectProject || '请选择项目'}</option>`;
        projects.forEach(p => {
            projectSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
        updateModuleSelect();
    }

    function updateModuleSelect() {
        const trans = translations[currentLang];
        const moduleSelect = document.getElementById('releaseFirmwareModule');
        const prevValue = moduleSelect.value;
        moduleSelect.innerHTML = `<option value="">${trans.selectModule || '请选择模块'}</option>`;
        // 显示所有模块（DB 中模块不与项目绑定）
        modules.forEach(m => {
            moduleSelect.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        });
        if (prevValue) moduleSelect.value = prevValue;
    }

    function getMaxFileSizeBytes() {
        try {
            const s = JSON.parse(localStorage.getItem('firmwareSettings') || '{}');
            return (parseInt(s.maxFileSize) || 100) * 1024 * 1024;
        } catch(e) { return 100 * 1024 * 1024; }
    }

    function handleFileSelect(file) {
        const maxBytes = getMaxFileSizeBytes();
        if (file.size > maxBytes) {
            const trans = translations[currentLang];
            const maxMB = (maxBytes / 1024 / 1024).toFixed(0);
            const fileMB = (file.size / 1024 / 1024).toFixed(2);
            alert((trans.fileSizeExceeds || '文件大小超过限制') + `\uff08最大 ${maxMB} MB\uff0c当前 ${fileMB} MB\uff09`);
            document.getElementById('firmwareFile').value = '';
            return;
        }
        selectedFile = file;
        const fileInfo = document.getElementById('fileInfo');
        document.getElementById('selectedFileName').textContent = file.name;
        document.getElementById('selectedFileSize').textContent = formatFileSize(file.size);
        fileInfo.style.display = 'block';
        document.getElementById('fileUploadArea').style.display = 'none';
    }

    function clearFile() {
        selectedFile = null;
        document.getElementById('firmwareFile').value = '';
        document.getElementById('fileInfo').style.display = 'none';
        document.getElementById('fileUploadArea').style.display = 'flex';
    }

    function validateForm() {
        const projectId = document.getElementById('releaseFirmwareProject').value;
        const moduleId = document.getElementById('releaseFirmwareModule').value;
        const version = document.getElementById('releaseFirmwareVersion').value.trim();
        const description = document.getElementById('releaseFirmwareDescription').value.trim();
        const trans = translations[currentLang];
        
        if (!projectId) { alert(trans.selectProject || '请选择项目'); return false; }
        if (!moduleId)  { alert(trans.selectModule  || '请选择模块'); return false; }
        if (!version)   { alert(trans.enterFirmwareVersion || '请输入固件版本'); return false; }
        if (!description) { alert(trans.enterFirmwareDescription || '请输入固件描述'); return false; }
        if (!selectedFile) { alert(trans.selectFile || '请选择固件文件'); return false; }
        const maxBytes = getMaxFileSizeBytes();
        if (selectedFile.size > maxBytes) {
            const maxMB = (maxBytes / 1024 / 1024).toFixed(0);
            const fileMB = (selectedFile.size / 1024 / 1024).toFixed(2);
            alert((trans.fileSizeExceeds || '文件大小超过限制') + `\uff08最大 ${maxMB} MB\uff0c当前 ${fileMB} MB\uff09`);
            return false;
        }
        if (!/^V?\d+\.\d+\.\d+(\.\d+)?$/.test(version)) {
            alert(trans.invalidVersionFormat || '版本号格式不正确，例如: V1.0.0 / 1.0.0 或 V1.0.0.1 / 1.0.0.1');
            return false;
        }
        return true;
    }

    async function publishFirmware() {
        if (uploadTask.state === 'uploading') {
            alert('当前有上传任务正在进行，请先完成或取消');
            return;
        }
        if (!validateForm()) return;
        
        const trans = translations[currentLang];
        const projectId = document.getElementById('releaseFirmwareProject').value;
        const moduleId = document.getElementById('releaseFirmwareModule').value;
        const version = document.getElementById('releaseFirmwareVersion').value.trim();
        const description = document.getElementById('releaseFirmwareDescription').value.trim();
        
        // 检查版本是否已存在（同项目同模块下）
        const existingFirmware = firmware.some(f =>
            String(f.moduleId || f.module_id) === moduleId &&
            String(f.projectId || f.project_id) === projectId &&
            f.version === version
        );
        if (existingFirmware) {
            alert(trans.versionAlreadyExists || '该模块版本已存在，请输入不同的版本号');
            return;
        }

        try {
            await doUpload({ projectId, moduleId, version, description, file: selectedFile });
            alert(trans.publishSuccess || '固件发布成功！');
            resetForm();
            await DataManager.reloadFirmware();
        } catch (e) {
            if (e.message === '__UPLOAD_CANCELED__') return;
            console.error('发布固件出错:', e);
            if (e.message !== '未登录') alert(trans.publishError || '发布固件时出错，请重试');
            resetUploadTask(true);
            setMainActionDisabled(false);
        }
    }

    function resetForm() {
        document.getElementById('releaseFirmwareProject').value = '';
        document.getElementById('releaseFirmwareModule').value = '';
        document.getElementById('releaseFirmwareVersion').value = '';
        document.getElementById('releaseFirmwareDescription').value = '';
        clearFile();
        updateModuleSelect();
    }

    function setPublishPermissions(allowed) {
        const form = document.getElementById('releaseFirmwareForm');
        if (!form) return;
        const controls = form.querySelectorAll('input, select, textarea, button');
        controls.forEach(el => {
            if (el.id === 'firmwareFile') return; // keep file input hidden, control via upload area
            el.disabled = !allowed;
            if (el.tagName === 'BUTTON') {
                if (!allowed) el.classList.add('btn-disabled');
                else el.classList.remove('btn-disabled');
            }
            if (!allowed) el.title = '仅管理员或开发者可操作';
            else el.title = '';
        });

        const fileUploadArea = document.getElementById('fileUploadArea');
        const firmwareFile = document.getElementById('firmwareFile');
        const clearFileBtn = document.getElementById('clearFileBtn');
        if (!allowed) {
            if (fileUploadArea) fileUploadArea.classList.add('disabled');
            if (firmwareFile) firmwareFile.disabled = true;
            if (clearFileBtn) { clearFileBtn.disabled = true; clearFileBtn.classList.add('btn-disabled'); }
        } else {
            if (fileUploadArea) fileUploadArea.classList.remove('disabled');
            if (firmwareFile) firmwareFile.disabled = false;
            if (clearFileBtn) { clearFileBtn.disabled = false; clearFileBtn.classList.remove('btn-disabled'); }
        }
    }


    function applyLanguage(lang) {
        currentLang = lang;
        
        const trans = translations[lang];
        
        // 标签 (安全赋值，避免元素不存在时报错)
        function setText(id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
        setText('releaseFirmwareProjectLabel', trans.releaseFirmwareProjectLabel || trans.selectProjectLabel || '所属项目');
        setText('releaseFirmwareModuleLabel', trans.releaseFirmwareModuleLabel || trans.selectModuleLabel || '所属模块');
        setText('releaseFirmwareVersionLabel', trans.firmwareVersionLabel || '固件版本');
        setText('releaseFirmwareDescriptionLabel', trans.firmwareDescriptionLabel || '固件描述');
        setText('formUploadTitle', trans.firmwareFile || '固件文件');
        setText('fileUploadDragText', trans.dragFilesHere || '拖拽文件到此处或点击选择');
        setText('resetBtn', trans.reset || '重置');
        setText('publishBtn', trans.publish || '发布固件');

        // 输入框 placeholder
        function setPlaceholder(id, val) {
            const el = document.getElementById(id);
            if (el && val) el.placeholder = val;
        }
        setPlaceholder('releaseFirmwareVersion',    trans.releaseFirmwareVersionPlaceholder || '例如: V1.0.0 或 V1.0.0.1');
        setPlaceholder('releaseFirmwareDescription', trans.releaseFirmwareDescPlaceholder   || '描述固件功能和更新内容');
        setText('fileUploadText', trans.releaseFirmwareFileHint || '支持任何格式的文件，建议不超过100MB');
        
        // 温馨提示文本
        if (document.getElementById('tipsTitle')) {
            document.getElementById('tipsTitle').textContent = trans.tipsTitle || '温馨提示';
        }
        if (document.getElementById('tipsFirmwareName')) {
            document.getElementById('tipsFirmwareName').textContent = trans.tipsFirmwareName || '固件名称应简洁明了，便于识别';
        }
        if (document.getElementById('tipsVersion')) {
            document.getElementById('tipsVersion').textContent = trans.tipsVersion || '版本号遵循 V主版本.次版本.修订版本（可选.构建号）格式';
        }
        if (document.getElementById('tipsDescription')) {
            document.getElementById('tipsDescription').textContent = trans.tipsDescription || '完整的固件描述有助于用户了解更新内容';
        }
        // 已合并提示列表，标题项已移除
        if (document.getElementById('tipsFileSize')) {
            document.getElementById('tipsFileSize').textContent = trans.tipsFileSize || '文件大小不能超过系统设置里的最大文件大小';
        }
        if (document.getElementById('tipsFileFormat')) {
            document.getElementById('tipsFileFormat').textContent = trans.tipsFileFormat || '支持所有常见的压缩和固件格式';
        }
        if (document.getElementById('tipsFileSecurity')) {
            document.getElementById('tipsFileSecurity').textContent = trans.tipsFileSecurity || '上传前请确保文件的完整性和安全性';
        }
        // 发布建议区已移除
        
        updateProjectSelects();
    }

    // 全局暴露函数
    window.applyLanguage = applyLanguage;

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'languageChange') {
            applyLanguage(event.data.lang);
        }
    });

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
