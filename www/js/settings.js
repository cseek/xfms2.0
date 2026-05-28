/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:35:44
 * @Description: 设置页面脚本，负责加载和展示系统设置、处理设置的修改和保存操作，并监听语言切换事件以动态更新文本内容，同时根据用户角色控制某些设置项的可编辑性
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */
(function() {
    'use strict';
    
    let currentLang = localStorage.getItem('firmwareLang') || 'zh';

    function init() {
        applyLanguage(currentLang);
        loadSettings();
        setupEventListeners();
    }


    function _isAdmin() {
        try {
            const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
            return user && user.role === '管理员';
        } catch (e) { return false; }
    }

    async function loadSettings() {
        try {
            const res = await API.settings.get();
            const s = res || {};
            const lang = s.defaultLanguage || 'zh';
            const maxSize = parseInt(s.maxFileSize) || 100;
            document.getElementById('defaultLanguage').value = lang;
            document.getElementById('maxFileSize').value = maxSize;
            // 同步到 localStorage 供其他页面（如发布固件）同步读取
            _syncToLocalStorage(lang, maxSize);
            // 非管理员不可编辑最大文件大小：前端禁用并变为浅色
            try {
                const maxInput = document.getElementById('maxFileSize');
                const maxLabel = document.getElementById('maxFileSizeLabel');
                const langSelect = document.getElementById('defaultLanguage');
                const langLabel = document.getElementById('defaultLanguageLabel');
                if (! _isAdmin()) {
                    if (maxInput) {
                        maxInput.disabled = true;
                        maxInput.classList.add('readonly-input');
                        maxInput.title = '仅管理员可修改此项';
                    }
                    if (maxLabel) maxLabel.classList.add('muted-label');
                    if (langSelect) {
                        langSelect.disabled = true;
                        langSelect.classList.add('readonly-input');
                        langSelect.title = '仅管理员可修改此项';
                    }
                    if (langLabel) langLabel.classList.add('muted-label');
                } else {
                    if (maxInput) {
                        maxInput.disabled = false;
                        maxInput.classList.remove('readonly-input');
                        maxInput.title = '';
                    }
                    if (maxLabel) maxLabel.classList.remove('muted-label');
                    if (langSelect) {
                        langSelect.disabled = false;
                        langSelect.classList.remove('readonly-input');
                        langSelect.title = '';
                    }
                    if (langLabel) langLabel.classList.remove('muted-label');
                }
            } catch (e) { /* ignore */ }
        } catch(e) {
            // 降级：从 localStorage 读取
            const saved = localStorage.getItem('firmwareSettings');
            if (saved) {
                const s = JSON.parse(saved);
                document.getElementById('defaultLanguage').value = s.defaultLanguage || 'zh';
                document.getElementById('maxFileSize').value = s.maxFileSize || 100;
                // 同步前端禁用状态
                try {
                    if (! _isAdmin()) {
                        const maxInput = document.getElementById('maxFileSize');
                        const maxLabel = document.getElementById('maxFileSizeLabel');
                        const langSelect = document.getElementById('defaultLanguage');
                        const langLabel = document.getElementById('defaultLanguageLabel');
                        if (maxInput) { maxInput.disabled = true; maxInput.classList.add('readonly-input'); maxInput.title = '仅管理员可修改此项'; }
                        if (maxLabel) maxLabel.classList.add('muted-label');
                        if (langSelect) { langSelect.disabled = true; langSelect.classList.add('readonly-input'); langSelect.title = '仅管理员可修改此项'; }
                        if (langLabel) langLabel.classList.add('muted-label');
                    }
                } catch(e) {}
            }
        }
    }

    function _syncToLocalStorage(lang, maxFileSize) {
        localStorage.setItem('firmwareSettings', JSON.stringify({ defaultLanguage: lang, maxFileSize }));
    }

    function setupEventListeners() {
        document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);
        document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
        // 非管理员禁用按钞
        if (!_isAdmin()) {
            const resetBtn = document.getElementById('resetSettingsBtn');
            const saveBtn  = document.getElementById('saveSettingsBtn');
            if (resetBtn) { resetBtn.disabled = true; resetBtn.classList.add('readonly-input'); resetBtn.title = '仅管理员可操作'; }
            if (saveBtn)  { saveBtn.disabled  = true; saveBtn.classList.add('readonly-input');  saveBtn.title  = '仅管理员可操作'; }
        }
    }

    function resetSettings() {
        document.getElementById('defaultLanguage').value = 'zh';
        document.getElementById('maxFileSize').value = 100;
    }

    async function saveSettings() {
        const newLang = document.getElementById('defaultLanguage').value;
        const maxFileSize = parseInt(document.getElementById('maxFileSize').value) || 100;
        const trans = translations[currentLang];

        try {
            // 非管理员不应传递 maxFileSize（后端也会拒绝），只传递管理员有权限的字段
            const payload = { defaultLanguage: newLang };
            if (_isAdmin()) payload.maxFileSize = maxFileSize;
            await API.settings.save(payload);
        } catch(e) {
            alert('保存失败: ' + (e.message || '请重试'));
            return;
        }

        // 同步到 localStorage
        _syncToLocalStorage(newLang, maxFileSize);

        // 若语言发生变化，立即生效并通知父框架
        if (newLang !== currentLang) {
            currentLang = newLang;
            localStorage.setItem('firmwareLang', newLang);
            applyLanguage(newLang);
            window.parent.postMessage({ type: 'languageChange', lang: newLang }, '*');
        }

        alert(trans.settingsSaved || '设置已保存');
    }

    window.addEventListener('message', (event) => {
        if (event.data.type === 'languageChange') {
            currentLang = event.data.lang;
            applyLanguage(currentLang);
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();