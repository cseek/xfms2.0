/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:34:26
 * @Description: 模块管理页面脚本，负责加载和展示模块列表、处理模块的添加/编辑/删除操作，提供分页和搜索功能，并监听语言切换事件以动态更新文本内容
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */

(function() {
    'use strict';
    
    let currentLang = localStorage.getItem('firmwareLang') || 'zh';
    let currentEditId = null;
    let deleteId = null;
    let currentPage = 1;
    const PAGE_SIZE = 25;
    let currentFilters = {};
    let currentPageData = [];

    async function init() {
        await DataManager.loadData();
        applyLanguage(currentLang);
        await fetchPage();
        setupEventListeners();
    }

    function _isAdmin() {
        try {
            const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
            return user && user.role === '管理员';
        } catch (e) { return false; }
    }

    function setupEventListeners() {
        document.getElementById('addModuleBtn').addEventListener('click', () => openModuleModal());
        document.getElementById('closeModuleModal').addEventListener('click', () => closeModal('moduleModal'));
        document.getElementById('cancelModuleBtn').addEventListener('click', () => closeModal('moduleModal'));
        document.getElementById('saveModuleBtn').addEventListener('click', saveModule);
        document.getElementById('closeConfirmModal').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('cancelConfirmBtn').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        document.getElementById('filterModuleKeyword').addEventListener('input', filterModuleList);
        document.getElementById('closeModuleDetailModal').addEventListener('click', () => closeModal('moduleDetailModal'));
        document.getElementById('cancelModuleDetailBtn').addEventListener('click', () => closeModal('moduleDetailModal'));
        // 非管理员禁用添加按钮
        if (!_isAdmin()) {
            const addBtn = document.getElementById('addModuleBtn');
            if (addBtn) { addBtn.disabled = true; addBtn.classList.add('readonly-input'); addBtn.title = '仅管理员可操作'; }
        }
    }

    function filterModuleList() {
        currentFilters = {
            keyword: document.getElementById('filterModuleKeyword').value.trim()
        };
        currentPage = 1;
        fetchPage();
    }

    async function fetchPage() {
        const params = { page: currentPage, pageSize: PAGE_SIZE, ...currentFilters };
        try {
            const result = await API.modules.page(params);
            currentPageData = result.list || [];
            renderModuleListTable(currentPageData, result.total, result.totalPages);
        } catch(e) {
            console.error('获取模块列表失败:', e);
            currentPageData = [];
            renderModuleListTable([], 0, 0);
        }
    }

    function renderModuleListTable(data, total, totalPages) {
        const tbody = document.getElementById('moduleListTable');
        const trans = translations[currentLang];
        // 判断当前用户是否为管理员（支持中英文存储值）
        let isAdmin = false;
        try {
            const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
            const roleZhAdmin = translations['zh'].roleAdmin;
            const roleEnAdmin = translations['en'].roleAdmin;
            isAdmin = cu && (cu.role === roleZhAdmin || cu.role === roleEnAdmin);
        } catch(e) { isAdmin = false; }
        const adminTitle = trans.onlyAdminOperate || (currentLang === 'en' ? 'Admin only' : '仅管理员可操作');
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">${trans.noData}</td></tr>`;
            renderPagination(0, 0);
            return;
        }
        
        let html = '';
        data.forEach(m => {
            const editDisabled = !isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.editModule(${m.id})" title="${trans.edit}"`);
            const deleteDisabled = !isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.deleteModule(${m.id})" title="${trans.delete}"`);
            html += `
            <tr>
                <td data-label="${trans.moduleNameHeader || '模块名称'}"><strong>${m.name}</strong></td>
                <td data-label="${trans.moduleFirmwareCountHeader || '固件数量'}">${m.firmwareCount || 0}</td>
                <td data-label="${trans.moduleCreatorHeader || '创建人'}">${m.creator || '-'}</td>
                <td data-label="${trans.moduleCreatedAtHeader || '创建时间'}">${m.createdAt || m.created_at || '-'}</td>
                <td data-label="${trans.moduleDescHeader || '模块简介'}" title="${m.description || ''}">${m.description ? (m.description.length > 15 ? m.description.slice(0, 15) + '…' : m.description) : '-'}</td>
                <td class="actions" data-label="${trans.moduleActionsHeader || '操作'}">
                    <div class="actions-inner">
                        <button class="btn btn-icon btn-info" onclick="window.detailModule(${m.id})" title="${trans.detail||'详情'}">👁️</button>
                        <button class="btn btn-icon btn-secondary" ${editDisabled}>✏️</button>
                        <button class="btn btn-icon btn-danger" ${deleteDisabled}>🗑️</button>
                    </div>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        renderPagination(total, totalPages);
    }

    function renderPagination(total, totalPages) {
        const bar = document.getElementById('modulePaginationBar');
        if (!bar) return;
        if (total === 0) { bar.innerHTML = ''; return; }

        const trans = translations[currentLang];
        let html = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} aria-label="${trans.prevPage || '上一页'}" title="${trans.prevPage || '上一页'}" onclick="window._modGoPage(${currentPage - 1})">&#x2039;</button>`;
        html += `<span class="pagination-info">${currentPage} / ${totalPages}</span>`;
        html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} aria-label="${trans.nextPage || '下一页'}" title="${trans.nextPage || '下一页'}" onclick="window._modGoPage(${currentPage + 1})">&#x203A;</button>`;
        bar.innerHTML = html;
    }

    function openModuleModal(moduleId = null) {
        const modal = document.getElementById('moduleModal');
        const title = document.getElementById('moduleModalTitle');
        const trans = translations[currentLang];
        currentEditId = moduleId;
        
        if (moduleId) {
            title.textContent = trans.editModuleModalTitle || (trans.edit + ' ' + trans.navModuleList);
            const m = currentPageData.find(m => m.id === moduleId);
            if (m) {
                document.getElementById('modalModuleName').value = m.name;
                document.getElementById('modalModuleDescription').value = m.description || '';
            }
        } else {
            title.textContent = trans.moduleModalTitle;
            document.getElementById('modalModuleName').value = '';
            document.getElementById('modalModuleDescription').value = '';
        }
        
        openModal('moduleModal');
    }

    async function saveModule() {
        const name = document.getElementById('modalModuleName').value.trim();
        const description = document.getElementById('modalModuleDescription').value.trim();
        const trans = translations[currentLang];
        
        if (!name) { alert(trans.enterModuleName); return; }
        if (!description) { alert(trans.enterModuleDescription || '请输入模块简介'); return; }
        
        try {
            if (currentEditId) {
                await API.modules.update(currentEditId, { name, description });
            } else {
                await API.modules.create({ name, description });
            }
            await fetchPage();
            closeModal('moduleModal');
        } catch (e) {
            alert(e.message || trans.saveFailed || '保存失败');
        }
    }

    function deleteModule(id) {
        deleteId = id;
        const trans = translations[currentLang];
        document.getElementById('confirmModalMessage').textContent = trans.confirmDeleteModule;
        openModal('confirmModal');
    }

    async function confirmDelete() {
        try {
            await API.modules.remove(deleteId);
            await fetchPage();
        } catch (e) {
            alert(e.message || translations[currentLang].deleteFailed || '删除失败');
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

    function detailModule(id) {
        const m = currentPageData.find(m => m.id === id);
        if (!m) return;
        document.getElementById('detailModuleName').textContent = m.name || '-';
        document.getElementById('detailModuleFirmwareCount').textContent = m.firmwareCount != null ? m.firmwareCount : '-';
        document.getElementById('detailModuleCreator').textContent = m.creator || '-';
        document.getElementById('detailModuleCreatedAt').textContent = m.createdAt || m.created_at || '-';
        document.getElementById('detailModuleDesc').textContent = m.description || '-';
        openModal('moduleDetailModal');
    }

    window.editModule = function(id) { openModuleModal(id); };
    window.deleteModule = deleteModule;
    window.detailModule = detailModule;
    window._modGoPage = function(page) {
        currentPage = page;
        fetchPage();
    };

    window.addEventListener('message', (event) => {
        if (event.data.type === 'languageChange') {
            currentLang = event.data.lang;
            applyLanguage(currentLang);
            fetchPage();
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();

