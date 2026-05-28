/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:33:45
 * @Description: 固件列表页面脚本，负责加载和展示所有已发布的固件信息，提供搜索、过滤、分页等功能，并允许用户查看固件详情、编辑或删除固件，同时提供一个按钮跳转到发布固件页面
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */
(function() {
    'use strict';
    
    let currentLang = localStorage.getItem('firmwareLang') || 'zh';
    let deleteId = null;
    let currentEditId = null;
    let currentPage = 1;
    const PAGE_SIZE = 25;
    let currentFilters = {};
    let currentPageData = [];
    let downloadTask = {
        xhr: null,
        fw: null,
        chunks: [],
        receivedBytes: 0,
        totalBytes: 0,
        state: 'idle',
        cancelRequested: false
    };

    async function init() {
        await loadData();
        applyLanguage(currentLang);
        updateFilterSelects();
        updateSearchPlaceholder();
        await fetchPage();
        setupEventListeners();
    }

    function updateSearchPlaceholder() {
        const trans = translations[currentLang];
        const el = document.getElementById('filterKeyword');
        if (el) el.placeholder = trans.firmwareSearchPlaceholder || '搜索固件...';
    }

    async function loadData() {
        await DataManager.loadData();
    }

    function _isAdminOrDev() {
        try {
            const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
            return user && (user.role === '管理员' || user.role === '开发者');
        } catch (e) { return false; }
    }

    function setupEventListeners() {
        document.getElementById('closeFirmwareModal').addEventListener('click', () => closeModal('firmwareModal'));
        document.getElementById('cancelFirmwareBtn').addEventListener('click', () => closeModal('firmwareModal'));
        document.getElementById('closeFirmwareDetailModal').addEventListener('click', () => closeModal('firmwareDetailModal'));
        document.getElementById('cancelFirmwareDetailBtn').addEventListener('click', () => closeModal('firmwareDetailModal'));
        document.getElementById('saveFirmwareBtn').addEventListener('click', saveFirmware);
        document.getElementById('filterProject').addEventListener('change', filterFirmwareList);
        document.getElementById('filterModule').addEventListener('change', filterFirmwareList);
        document.getElementById('filterStatus').addEventListener('change', filterFirmwareList);
        document.getElementById('filterKeyword').addEventListener('input', filterFirmwareList);
        document.getElementById('goReleaseFirmwareBtn').addEventListener('click', function () {
            const parent = window.parent;
            parent.document.getElementById('contentFrame').src = 'pages/release-firmware.html';
            parent.document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            const releaseLink = parent.document.querySelector('.nav-link[data-page="release-firmware"]');
            if (releaseLink) {
                releaseLink.classList.add('active');
                const title = (parent.currentLang === 'zh')
                    ? releaseLink.getAttribute('data-title')
                    : releaseLink.getAttribute('data-title-en');
                parent.document.getElementById('pageTitle').textContent = title || '发布固件';
            }
        });
        document.getElementById('closeConfirmModal').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('cancelConfirmBtn').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        const cancelBtn = document.getElementById('downloadCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', cancelDownload);
        // 非管理员/开发者禁用"发布固件"按钮
        if (!_isAdminOrDev()) {
            const btn = document.getElementById('goReleaseFirmwareBtn');
            if (btn) { btn.disabled = true; btn.classList.add('readonly-input'); btn.title = '仅管理员或开发者可操作'; }
        }
    }

    function updateFilterSelects() {
        const filterProject = document.getElementById('filterProject');
        const trans = translations[currentLang];
        
        filterProject.innerHTML = '<option value="">' + trans.allProjects + '</option>';
        projects.forEach(p => {
            filterProject.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });
        
        const modalProjectSelect = document.getElementById('modalFirmwareProject');
        if (modalProjectSelect) {
            modalProjectSelect.innerHTML = `<option value="">${trans.selectProject || '请选择项目'}</option>`;
            projects.forEach(p => {
                modalProjectSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
            });
        }
        
        const filterModule = document.getElementById('filterModule');
        filterModule.innerHTML = '<option value="">' + (trans.allModules || '全部模块') + '</option>';
        modules.forEach(m => {
            filterModule.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        });
    }

    function openFirmwareModal(firmwareId) {
        const modal = document.getElementById('firmwareModal');
        const title = document.getElementById('firmwareModalTitle');
        const trans = translations[currentLang];
        currentEditId = firmwareId;

        const projectSelect = document.getElementById('modalFirmwareProject');
        projectSelect.innerHTML = `<option value="">${trans.selectProject || '请选择项目'}</option>`;
        projects.forEach(p => {
            projectSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
        });

        const moduleSelect = document.getElementById('modalFirmwareModule');
        moduleSelect.innerHTML = `<option value="">${trans.selectModule || '请选择模块'}</option>`;
        modules.forEach(m => {
            moduleSelect.innerHTML += `<option value="${m.id}">${m.name}</option>`;
        });
        
        title.textContent = trans.editFirmwareModalTitle || ('编辑固件');
        const fw = currentPageData.find(f => f.id === firmwareId);
        if (fw) {
            document.getElementById('modalFirmwareProject').value = fw.projectId || fw.project_id || '';
            document.getElementById('modalFirmwareModule').value = fw.moduleId || fw.module_id || '';
            document.getElementById('modalFirmwareVersion').value = fw.version || '';
            document.getElementById('modalFirmwareDescription').value = fw.description || '';
        }
        
        openModal('firmwareModal');
    }

    async function saveFirmware() {
        const projectId = document.getElementById('modalFirmwareProject').value;
        const moduleId = document.getElementById('modalFirmwareModule').value;
        const version = document.getElementById('modalFirmwareVersion').value.trim();
        const description = document.getElementById('modalFirmwareDescription').value.trim();
        // 状态保持不变（通过列表行内下拉框修改），取当前缓存值
        const fw = currentPageData.find(f => f.id === currentEditId);
        const status = fw ? fw.status : 'pending';
        const trans = translations[currentLang];
        
        if (!projectId)   { alert(trans.selectProjectFirst); return; }
        if (!moduleId)    { alert(trans.selectModuleFirst);  return; }
        if (!version)     { alert(trans.enterFirmwareVersion); return; }
        if (!description) { alert(trans.enterFirmwareDescription); return; }
        if (!/^V?\d+\.\d+\.\d+(\.\d+)?$/.test(version)) {
            alert(trans.invalidVersionFormat || '版本号格式不正确，例如: V1.0.0 / 1.0.0 或 V1.0.0.1 / 1.0.0.1');
            return;
        }
        
        try {
            await API.firmwares.update(currentEditId, {
                version, description,
                project_id: projectId, module_id: moduleId, status
            });
            await fetchPage();
            closeModal('firmwareModal');
        } catch (e) {
            alert(e.message || '保存失败');
        }
    }

    function filterFirmwareList() {
        currentFilters = {
            projectId: document.getElementById('filterProject').value,
            moduleId:  document.getElementById('filterModule').value,
            status:    document.getElementById('filterStatus').value,
            keyword:   document.getElementById('filterKeyword').value.trim()
        };
        currentPage = 1;
        fetchPage();
    }

    async function fetchPage() {
        const params = { page: currentPage, pageSize: PAGE_SIZE, ...currentFilters };
        try {
            const result = await API.firmwares.page(params);
            currentPageData = result.list || [];
            renderFirmwareList(currentPageData, result.total, result.totalPages);
        } catch(e) {
            console.error('获取固件列表失败:', e);
            currentPageData = [];
            renderFirmwareList([], 0, 0);
        }
    }

    function renderFirmwareList(data, total, totalPages) {
        const tbody = document.getElementById('firmwareListTable');
        const trans = translations[currentLang];
        // 判断当前用户是否有修改权限（管理员或开发者）
        // 以及是否允许更改固件状态（管理员、开发者、测试员）
        let canModify = false;
        let canChangeStatus = false;
        try {
            const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
            const rzh = translations['zh'];
            const ren = translations['en'];
            const isAdmin = cu && (cu.role === rzh.roleAdmin || cu.role === ren.roleAdmin);
            const isDev = cu && (cu.role === rzh.roleDeveloper || cu.role === ren.roleDeveloper);
            const isTester = cu && (cu.role === rzh.roleTester || cu.role === ren.roleTester);
            canModify = isAdmin || isDev;
            canChangeStatus = isAdmin || isDev || isTester;
        } catch (e) { canModify = false; canChangeStatus = false; }
        const changeStatusTitle = trans.onlyAdminOperate || (currentLang === 'en' ? 'Admin/Dev/Testers only' : '仅管理员/开发者/测试员可修改');
        const modifyTitle = trans.onlyAdminOperate || (currentLang === 'en' ? 'Admin/Dev only' : '仅管理员或开发者可操作');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem;">${trans.noData}</td></tr>`;
            renderPagination(0, 0);
            return;
        }
        
        let html = '';
        data.forEach(f => {
            const statusAttr = !canChangeStatus ? ('disabled title="' + changeStatusTitle + '"') : (`onchange="window.changeStatus(${f.id}, this)"`);
            const editAttr = !canModify ? ('disabled class="btn-disabled" title="' + modifyTitle + '"') : (`onclick="window.editFirmware(${f.id})" title="${trans.edit||'编辑'}"`);
            const deleteAttr = !canModify ? ('disabled class="btn-disabled" title="' + modifyTitle + '"') : (`onclick="window.deleteFirmware(${f.id})" title="${trans.delete||'删除'}"`);
            html += `
            <tr>
                <td class="status-border-${f.status}" data-label="${trans.recentFirmwareVersionHeader || '版本'}"><strong>${f.version}</strong></td>
                <td data-label="${trans.recentFirmwareModuleHeader || '模块'}"><strong>${f.moduleName || '-'}</strong></td>
                <td data-label="${trans.recentFirmwareProjectHeader || '项目'}"><strong>${f.projectName || '-'}</strong></td>
                <td data-label="${trans.recentFirmwareStatusHeader || '状态'}"><select class="status-badge status-${f.status} status-inline-select" ${statusAttr}>
                    <option value="pending"   ${f.status==='pending'   ?'selected':''}>${trans.pending   ||'待测试'}</option>
                    <option value="tested"    ${f.status==='tested'    ?'selected':''}>${trans.tested    ||'已测试'}</option>
                    <option value="activated" ${f.status==='activated' ?'selected':''}>${trans.activated ||'已激活'}</option>
                    <option value="deprecated"${f.status==='deprecated'?'selected':''}>${trans.deprecated||'已废弃'}</option>
                </select></td>
                <td data-label="${trans.recentFirmwareFileSizeHeader || '文件大小'}">${f.fileSize || '-'}</td>
                <td data-label="${trans.firmwareFileNameHeader || '文件名称'}" title="${f.fileName || ''}">${f.fileName ? (f.fileName.length > 15 ? f.fileName.slice(0, 15) + '\u2026' : f.fileName) : '-'}</td>
                <td data-label="${trans.recentFirmwareDateHeader || '发布时间'}">${f.releaseDate || '-'}</td>
                <td data-label="${trans.firmwareDescHeader || '备注'}" title="${f.description || ''}">${f.description ? (f.description.length > 7 ? f.description.slice(0, 7) + '\u2026' : f.description) : '-'}</td>
                <td class="actions" data-label="${trans.firmwareActionsHeader || '操作'}">
                    <div class="actions-inner">
                        <button class="btn btn-icon btn-secondary" onclick="window.detailFirmware(${f.id})" title="${trans.detail||'详情'}">👁️</button>
                        <button class="btn btn-icon btn-secondary" ${editAttr}>✏️</button>
                        <button class="btn btn-icon btn-secondary" onclick="window.downloadFirmware(${f.id})" title="${trans.download||'下载'}">⬇️</button>
                        <button class="btn btn-icon btn-danger" ${deleteAttr}>🗑️</button>
                    </div>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        renderPagination(total, totalPages);
    }

    async function changeStatus(id, selectEl) {
        const newStatus = selectEl.value;
        // 乐观更新：先改样式
        selectEl.className = `status-badge status-${newStatus} status-inline-select`;
        // 同步更新行首颜色边条
        const row = selectEl.closest('tr');
        if (row) {
            const firstTd = row.querySelector('td:first-child');
            if (firstTd) firstTd.className = `status-border-${newStatus}`;
        }
        // 更新本地缓存
        const fw = currentPageData.find(f => f.id === id);
        const prevStatus = fw ? fw.status : newStatus;
        if (fw) fw.status = newStatus;
        try {
            await API.firmwares.update(id, {
                version:     fw ? fw.version     : '',
                description: fw ? fw.description : '',
                project_id:  fw ? (fw.projectId || fw.project_id) : '',
                module_id:   fw ? (fw.moduleId  || fw.module_id)  : '',
                status: newStatus
            });
        } catch(e) {
            // 回滚
            if (fw) fw.status = prevStatus;
            selectEl.value = prevStatus;
            selectEl.className = `status-badge status-${prevStatus} status-inline-select`;
            if (row) {
                const firstTd = row.querySelector('td:first-child');
                if (firstTd) firstTd.className = `status-border-${prevStatus}`;
            }
            alert(e.message || '状态更新失败');
        }
    }

    function renderPagination(total, totalPages) {
        const bar = document.getElementById('paginationBar');
        if (!bar) return;
        if (total === 0) { bar.innerHTML = ''; return; }


        const trans = translations[currentLang];
        let html = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} aria-label="${trans.prevPage || '上一页'}" title="${trans.prevPage || '上一页'}" onclick="window._fwGoPage(${currentPage - 1})">&#x2039;</button>`;
        html += `<span class="pagination-info">${currentPage} / ${totalPages}</span>`;
        html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} aria-label="${trans.nextPage || '下一页'}" title="${trans.nextPage || '下一页'}" onclick="window._fwGoPage(${currentPage + 1})">&#x203A;</button>`;
        bar.innerHTML = html;
    }

    function detailFirmware(id) {
        const trans = translations[currentLang];
        const statusMap = {
            pending:    trans.pending    || '待测试',
            tested:     trans.tested     || '已测试',
            activated:  trans.activated  || '已激活',
            deprecated: trans.deprecated || '已废弃'
        };
        const fw = currentPageData.find(f => f.id === id);
        if (!fw) return;
        document.getElementById('detailFirmwareVersion').textContent = fw.version || '-';
        document.getElementById('detailFirmwareProject').textContent = fw.projectName || '-';
        document.getElementById('detailFirmwareModule').textContent = fw.moduleName || '-';
        document.getElementById('detailFirmwareDesc').textContent = fw.description || '-';
        document.getElementById('detailFirmwareFileName').textContent = fw.fileName || (fw.file_path ? fw.file_path.split('/').pop() : '-');
        document.getElementById('detailFirmwareSize').textContent = fw.fileSize || '-';
        document.getElementById('detailFirmwareMd5').textContent = fw.md5 || '-';
        document.getElementById('detailFirmwareDate').textContent = fw.releaseDate || '-';
        document.getElementById('detailFirmwareStatus').textContent = statusMap[fw.status] || fw.status || '-';
        openModal('firmwareDetailModal');
    }

    function getDownloadUI() {
        return {
            toast: document.getElementById('downloadProgressToast'),
            ringBar: document.getElementById('downloadRingBar'),
            titleText: document.getElementById('downloadProgressTitle'),
            subText: document.getElementById('downloadProgressSub')
        };
    }

    function initDownloadToast(title) {
        const ui = getDownloadUI();
        if (!ui.toast || !ui.ringBar) return;
        ui.ringBar.style.transition = 'none';
        ui.ringBar.style.strokeDasharray = '40 73.1';
        ui.ringBar.style.strokeDashoffset = '0';
        ui.ringBar.style.animation = 'downloadRingSpin 0.9s linear infinite';
        if (ui.titleText) ui.titleText.textContent = title || '正在下载...';
        if (ui.subText) ui.subText.textContent = '';
        ui.toast.style.display = 'flex';
    }

    function resetDownloadTask(hideToast) {
        const ui = getDownloadUI();
        if (hideToast && ui.toast) ui.toast.style.display = 'none';
        downloadTask.xhr = null;
        downloadTask.fw = null;
        downloadTask.chunks = [];
        downloadTask.receivedBytes = 0;
        downloadTask.totalBytes = 0;
        downloadTask.state = 'idle';
        downloadTask.cancelRequested = false;
    }

    function cancelDownload() {
        if (downloadTask.state === 'downloading' && downloadTask.xhr) {
            downloadTask.cancelRequested = true;
            downloadTask.xhr.abort();
            return;
        }
        resetDownloadTask(true);
    }

    function saveDownloadedBlob(blob, fw, xhr) {
        const cd = xhr.getResponseHeader('content-disposition') || '';
        let filename = fw.fileName || fw.version || 'firmware.bin';
        const m = cd.match(/filename\*=UTF-8''(.+)|filename="?([^";]+)"?/);
        if (m) filename = decodeURIComponent(m[1] || m[2]);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }

    async function runDownload(fw) {
        const RING_C = 113.1;
        const ui = getDownloadUI();

        downloadTask.fw = fw;
        downloadTask.chunks = [];
        downloadTask.receivedBytes = 0;
        downloadTask.totalBytes = 0;

        downloadTask.state = 'downloading';
        downloadTask.cancelRequested = false;
        initDownloadToast('正在下载...');

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            downloadTask.xhr = xhr;

            const url = API.firmwares.downloadUrl(fw.id);
            const token = localStorage.getItem('authToken');
            xhr.open('GET', url);
            if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.responseType = 'blob';

            xhr.addEventListener('progress', (e) => {
                if (e.lengthComputable && e.total > 0) {
                    const total = downloadTask.totalBytes > 0 ? downloadTask.totalBytes : (downloadTask.receivedBytes + e.total);
                    const loaded = downloadTask.receivedBytes + e.loaded;
                    const pct = Math.min(100, Math.round(loaded / total * 100));
                    ui.ringBar.style.animation = 'none';
                    ui.ringBar.style.strokeDasharray = '113.1';
                    ui.ringBar.style.transition = 'stroke-dashoffset 0.25s ease';
                    ui.ringBar.style.strokeDashoffset = RING_C * (1 - pct / 100);
                    const loadedMB = (loaded / 1024 / 1024).toFixed(1);
                    const totalMB = (total / 1024 / 1024).toFixed(1);
                    if (ui.subText) ui.subText.textContent = pct + '%  (' + loadedMB + ' / ' + totalMB + ' MB)';
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 401) {
                    resetDownloadTask(true);
                    localStorage.removeItem('currentUser');
                    localStorage.removeItem('authToken');
                    window.location.replace('/login.html');
                    reject(new Error('未登录'));
                    return;
                }
                if (xhr.status >= 400) {
                    reject(new Error('下载失败'));
                    return;
                }

                const cr = xhr.getResponseHeader('content-range');
                if (cr) {
                    const m = cr.match(/bytes\s+\d+-\d+\/(\d+)/);
                    if (m && m[1]) downloadTask.totalBytes = parseInt(m[1], 10) || downloadTask.totalBytes;
                } else if (!downloadTask.totalBytes) {
                    const cl = parseInt(xhr.getResponseHeader('content-length') || '0', 10);
                    if (cl > 0) downloadTask.totalBytes = downloadTask.receivedBytes + cl;
                }

                downloadTask.chunks.push(xhr.response);
                downloadTask.receivedBytes += xhr.response.size;

                const done = downloadTask.totalBytes > 0
                    ? downloadTask.receivedBytes >= downloadTask.totalBytes
                    : xhr.status === 200;

                if (!done) {
                    resolve();
                    return;
                }

                ui.ringBar.style.animation = 'none';
                ui.ringBar.style.strokeDasharray = '113.1';
                ui.ringBar.style.transition = 'stroke-dashoffset 0.2s ease';
                ui.ringBar.style.strokeDashoffset = '0';
                if (ui.subText) ui.subText.textContent = '100%';

                setTimeout(() => {
                    const allBlob = new Blob(downloadTask.chunks, { type: 'application/octet-stream' });
                    saveDownloadedBlob(allBlob, fw, xhr);
                    resetDownloadTask(true);
                    resolve();
                }, 400);
            });

            xhr.addEventListener('abort', () => {
                if (downloadTask.cancelRequested) {
                    resetDownloadTask(true);
                    reject(new Error('__DOWNLOAD_CANCELED__'));
                    return;
                }
                reject(new Error('下载已中断'));
            });

            xhr.addEventListener('error', () => reject(new Error('下载失败')));
            xhr.send();
        });
    }

    function downloadFirmware(id) {
        if (downloadTask.state === 'downloading') {
            alert('当前有下载任务正在进行，请先完成或取消');
            return;
        }

        const fw = currentPageData.find(f => f.id === id);
        if (!fw || !fw.file_path) {
            alert(translations[currentLang].noFileAvailable || '该固件暂无文件');
            return;
        }
        runDownload(fw).catch((e) => {
            if (e.message === '__DOWNLOAD_CANCELED__') return;
            console.error('下载失败:', e);
            alert('下载失败');
            resetDownloadTask(true);
        });
    }

    function deleteFirmware(id) {
        deleteId = id;
        const trans = translations[currentLang];
        document.getElementById('confirmModalMessage').textContent = trans.confirmDeleteFirmware;
        openModal('confirmModal');
    }

    async function confirmDelete() {
        try {
            await API.firmwares.remove(deleteId);
            await fetchPage();
        } catch (e) {
            alert(e.message || '删除失败');
        }
        closeModal('confirmModal');
        deleteId = null;
    }

    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.hidden = false;
        // 下一帧再加 active，确保过渡动画生效
        requestAnimationFrame(() => modal.classList.add('active'));
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('active');
        modal.hidden = true;
    }

    window.downloadFirmware = downloadFirmware;
    window.deleteFirmware = deleteFirmware;
    window.editFirmware = function(id) { openFirmwareModal(id); };
    window.detailFirmware = detailFirmware;
    window.changeStatus = changeStatus;
    window._fwGoPage = function(page) {
        currentPage = page;
        fetchPage();
    };

    window.addEventListener('message', (event) => {
        if (event.data.type === 'languageChange') {
            currentLang = event.data.lang;
            applyLanguage(currentLang);
            updateSearchPlaceholder();
            updateFilterSelects();
            fetchPage();
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();
