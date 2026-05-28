/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:34:47
 * @Description: 项目管理页面脚本，负责加载和展示项目列表、处理项目的添加/编辑/删除操作，提供分页和搜索功能，并监听语言切换事件以动态更新文本内容
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
        document.getElementById('addProjectBtn').addEventListener('click', () => openProjectModal());
        document.getElementById('closeProjectModal').addEventListener('click', () => closeModal('projectModal'));
        document.getElementById('cancelProjectBtn').addEventListener('click', () => closeModal('projectModal'));
        document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
        document.getElementById('closeConfirmModal').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('cancelConfirmBtn').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        document.getElementById('filterProjectKeyword').addEventListener('input', filterProjectList);
        document.getElementById('closeProjectDetailModal').addEventListener('click', () => closeModal('projectDetailModal'));
        document.getElementById('cancelProjectDetailBtn').addEventListener('click', () => closeModal('projectDetailModal'));
        // 非管理员禁用添加按钮
        if (!_isAdmin()) {
            const addBtn = document.getElementById('addProjectBtn');
            if (addBtn) { addBtn.disabled = true; addBtn.classList.add('readonly-input'); addBtn.title = '仅管理员可操作'; }
        }
    }

    function filterProjectList() {
        currentFilters = {
            keyword: document.getElementById('filterProjectKeyword').value.trim()
        };
        currentPage = 1;
        fetchPage();
    }

    async function fetchPage() {
        const params = { page: currentPage, pageSize: PAGE_SIZE, ...currentFilters };
        try {
            const result = await API.projects.page(params);
            currentPageData = result.list || [];
            renderProjectListTable(currentPageData, result.total, result.totalPages);
        } catch(e) {
            console.error('获取项目列表失败:', e);
            currentPageData = [];
            renderProjectListTable([], 0, 0);
        }
    }

    function renderProjectListTable(data, total, totalPages) {
        const tbody = document.getElementById('projectListTable');
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
        data.forEach(p => {
            const editDisabled = !isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.editProject(${p.id})" title="${trans.edit}"`);
            const deleteDisabled = !isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.deleteProject(${p.id})" title="${trans.delete}"`);
            html += `
            <tr>
                <td data-label="${trans.projectNameHeader || '项目名称'}"><strong>${p.name}</strong></td>
                <td data-label="${trans.projectModuleCountHeader || '模块数量'}">${p.moduleCount || 0}</td>
                <td data-label="${trans.projectCreatorHeader || '创建人'}">${p.creator || '-'}</td>
                <td data-label="${trans.projectDateHeader || '创建时间'}">${p.createdAt || p.created_at || '-'}</td>
                <td data-label="${trans.projectDescHeader || '项目简介'}" title="${p.description || ''}">${p.description ? (p.description.length > 15 ? p.description.slice(0, 15) + '…' : p.description) : '-'}</td>
                <td class="actions" data-label="${trans.projectActionsHeader || '操作'}">
                    <div class="actions-inner">
                        <button class="btn btn-icon btn-info" onclick="window.detailProject(${p.id})" title="${trans.detail||'详情'}">👁️</button>
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
        const bar = document.getElementById('projectPaginationBar');
        if (!bar) return;
        if (total === 0) { bar.innerHTML = ''; return; }

        const trans = translations[currentLang];
        let html = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} aria-label="${trans.prevPage || '上一页'}" title="${trans.prevPage || '上一页'}" onclick="window._projGoPage(${currentPage - 1})">&#x2039;</button>`;
        html += `<span class="pagination-info">${currentPage} / ${totalPages}</span>`;
        html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} aria-label="${trans.nextPage || '下一页'}" title="${trans.nextPage || '下一页'}" onclick="window._projGoPage(${currentPage + 1})">&#x203A;</button>`;
        bar.innerHTML = html;
    }

    function openProjectModal(projectId = null) {
        const modal = document.getElementById('projectModal');
        const title = document.getElementById('projectModalTitle');
        const trans = translations[currentLang];
        currentEditId = projectId;

        if (projectId) {
            title.textContent = trans.editProjectModalTitle || (trans.edit + ' ' + trans.navProjectList);
            const p = currentPageData.find(p => p.id === projectId);
            if (p) {
                document.getElementById('modalProjectName').value = p.name;
                document.getElementById('modalProjectDescription').value = p.description || '';
            }
        } else {
            title.textContent = trans.projectModalTitle;
            document.getElementById('modalProjectName').value = '';
            document.getElementById('modalProjectDescription').value = '';
        }

        openModal('projectModal');
    }

    async function saveProject() {
        const name = document.getElementById('modalProjectName').value.trim();
        const description = document.getElementById('modalProjectDescription').value.trim();
        const trans = translations[currentLang];

        if (!name) { alert(trans.enterProjectName); return; }
        if (!description) { alert(trans.enterProjectDescription); return; }

        try {
            if (currentEditId) {
                await API.projects.update(currentEditId, { name, description });
            } else {
                await API.projects.create({ name, description });
            }
            await fetchPage();
            closeModal('projectModal');
        } catch (e) {
            alert(e.message || trans.saveFailed || '保存失败');
        }
    }

    function deleteProject(id) {
        deleteId = id;
        const trans = translations[currentLang];
        document.getElementById('confirmModalMessage').textContent = trans.confirmDeleteProject;
        openModal('confirmModal');
    }

    async function confirmDelete() {
        try {
            await API.projects.remove(deleteId);
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

    function detailProject(id) {
        const p = currentPageData.find(p => p.id === id);
        if (!p) return;
        document.getElementById('detailProjectName').textContent = p.name || '-';
        document.getElementById('detailProjectModuleCount').textContent = p.moduleCount != null ? p.moduleCount : '-';
        document.getElementById('detailProjectCreator').textContent = p.creator || '-';
        document.getElementById('detailProjectCreatedAt').textContent = p.createdAt || p.created_at || '-';
        document.getElementById('detailProjectDesc').textContent = p.description || '-';
        openModal('projectDetailModal');
    }

    window.editProject = function(id) { openProjectModal(id); };
    window.deleteProject = deleteProject;
    window.detailProject = detailProject;
    window._projGoPage = function(page) {
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

