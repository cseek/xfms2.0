/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:35:58
 * @Description: 用户管理页面脚本，负责加载和展示用户列表、处理用户的添加/编辑/删除操作，提供分页和搜索功能，并监听语言切换事件以动态更新文本内容
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
        document.getElementById('addUserBtn').addEventListener('click', () => openUserModal());
        document.getElementById('closeUserModal').addEventListener('click', () => closeModal('userModal'));
        document.getElementById('cancelUserBtn').addEventListener('click', () => closeModal('userModal'));
        document.getElementById('saveUserBtn').addEventListener('click', saveUser);
        document.getElementById('closeConfirmModal').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('cancelConfirmBtn').addEventListener('click', () => closeModal('confirmModal'));
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        document.getElementById('filterUserKeyword').addEventListener('input', filterUserList);
        document.getElementById('closeUserDetailModal').addEventListener('click', () => closeModal('userDetailModal'));
        document.getElementById('cancelUserDetailBtn').addEventListener('click', () => closeModal('userDetailModal'));
        // 点击密码框时光标移到末尾
        const pwdInput = document.getElementById('modalUserPassword');
        pwdInput.addEventListener('click', function() {
            const len = this.value.length;
            this.setSelectionRange(len, len);
        });
        pwdInput.addEventListener('focus', function() {
            const len = this.value.length;
            this.setSelectionRange(len, len);
        });
        // 非管理员禁用添加按钮
        if (!_isAdmin()) {
            const addBtn = document.getElementById('addUserBtn');
            if (addBtn) { addBtn.disabled = true; addBtn.classList.add('readonly-input'); addBtn.title = '仅管理员可操作'; }
        }
    }

    function filterUserList() {
        currentFilters = {
            keyword: document.getElementById('filterUserKeyword').value.trim()
        };
        currentPage = 1;
        fetchPage();
    }

    async function fetchPage() {
        const params = { page: currentPage, pageSize: PAGE_SIZE, ...currentFilters };
        try {
            const result = await API.users.page(params);
            currentPageData = result.list || [];
            renderUserListTable(currentPageData, result.total, result.totalPages);
        } catch(e) {
            console.error('获取用户列表失败:', e);
            currentPageData = [];
            renderUserListTable([], 0, 0);
        }
    }

    function renderUserListTable(data, total, totalPages) {
        const tbody = document.getElementById('userListTable');
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
        data.forEach(u => {
            const displayName = u.name || u.username || '-';
            const role = u.role || '';

            // 映射角色文本到当前语言
            let displayRole = role;
            const roleZh = translations['zh'];
            const roleEn = translations['en'];
            if (role === roleZh.roleAdmin || role === roleEn.roleAdmin) displayRole = trans.roleAdmin;
            else if (role === roleZh.roleDeveloper || role === roleEn.roleDeveloper) displayRole = trans.roleDeveloper;
            else if (role === roleZh.roleTester || role === roleEn.roleTester) displayRole = trans.roleTester;
            else if (role === roleZh.roleUser || role === roleEn.roleUser) displayRole = trans.roleUser;

            let roleClass = 'role-user';
            if (displayRole === trans.roleAdmin) roleClass = 'role-admin';
            else if (displayRole === trans.roleDeveloper) roleClass = 'role-developer';
            else if (displayRole === trans.roleTester) roleClass = 'role-tester';

            html += `
            <tr>
                <td data-label="${trans.userNameHeader || '用户名'}"><strong>${displayName}</strong></td>
                <td data-label="${trans.userRoleHeader || '角色'}"><span class="role-badge ${roleClass}">${displayRole || '-'}</span></td>
                <td data-label="${trans.userEmailHeader || '电子邮箱'}">${u.email || '-'}</td>
                <td data-label="${trans.userJoinDateHeader || '创建时间'}">${u.joinDate || u.created_at || '-'}</td>
                <td data-label="${trans.userBioHeader || '用户简介'}" title="${u.bio || ''}">${u.bio ? (u.bio.length > 15 ? u.bio.slice(0, 15) + '…' : u.bio) : '-'}</td>
                <td class="actions" data-label="${trans.userActionsHeader || '操作'}">
                    <div class="actions-inner">
                        <button class="btn btn-icon btn-info" ${!isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.detailUser(${u.id})" title="${trans.detail||'详情'}"`)}>👁️</button>
                        <button class="btn btn-icon btn-secondary" ${!isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.editUser(${u.id})" title="${trans.edit}"`)}>✏️</button>
                        <button class="btn btn-icon btn-danger" ${!isAdmin ? ('disabled class="btn-disabled" title="' + adminTitle + '"') : (`onclick="window.deleteUser(${u.id})" title="${trans.delete}"`)}>🗑️</button>
                    </div>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
        renderPagination(total, totalPages);
    }

    function renderPagination(total, totalPages) {
        const bar = document.getElementById('userPaginationBar');
        if (!bar) return;
        if (total === 0) { bar.innerHTML = ''; return; }

        const trans = translations[currentLang];
        let html = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} aria-label="${trans.prevPage || '上一页'}" title="${trans.prevPage || '上一页'}" onclick="window._userGoPage(${currentPage - 1})">&#x2039;</button>`;
        html += `<span class="pagination-info">${currentPage} / ${totalPages}</span>`;
        html += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} aria-label="${trans.nextPage || '下一页'}" title="${trans.nextPage || '下一页'}" onclick="window._userGoPage(${currentPage + 1})">&#x203A;</button>`;
        bar.innerHTML = html;
    }

    function openUserModal(userId = null) {
        const modal = document.getElementById('userModal');
        const title = document.getElementById('userModalTitle');
        const trans = translations[currentLang];
        currentEditId = userId;

        if (userId) {
            title.textContent = trans.editUserModalTitle || (trans.edit + ' ' + trans.usersListTitle);
            const u = currentPageData.find(u => u.id === userId);
            if (u) {
                document.getElementById('modalUserName').value = u.name || u.username || '';
                document.getElementById('modalUserPassword').value = u.password || '';
                document.getElementById('modalUserEmail').value = u.email || '';
                document.getElementById('modalUserRole').value = u.role || '';
                document.getElementById('modalUserBio').value = u.bio || '';
            }
        } else {
            title.textContent = trans.userModalTitle;
            document.getElementById('modalUserName').value = '';
            document.getElementById('modalUserPassword').value = '';
            document.getElementById('modalUserEmail').value = '';
            document.getElementById('modalUserRole').value = '';
            document.getElementById('modalUserBio').value = '';
        }

        openModal('userModal');
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    async function saveUser() {
        const username = document.getElementById('modalUserName').value.trim();
        const password = document.getElementById('modalUserPassword').value;
        const email    = document.getElementById('modalUserEmail').value.trim();
        const role     = document.getElementById('modalUserRole').value;
        const bio      = document.getElementById('modalUserBio').value.trim();
        const trans = translations[currentLang];

        if (!username) { alert(trans.enterUserName);  return; }
        if (!email)    { alert(trans.enterUserEmail); return; }
        if (!validateEmail(email)) { alert(trans.invalidEmail); return; }
        if (!role)     { alert(trans.selectUserRole); return; }
        if (!password) { alert(trans.enterUserPassword || '请输入密码'); return; }

        try {
            if (currentEditId) {
                await API.users.update(currentEditId, { username, password, email, role, bio });
            } else {
                await API.users.create({ username, password, email, role, bio });
            }
            await fetchPage();
            closeModal('userModal');
        } catch (e) {
            alert(e.message || trans.saveFailed || '保存失败');
        }
    }

    function deleteUser(id) {
        deleteId = id;
        const trans = translations[currentLang];
        document.getElementById('confirmModalMessage').textContent = trans.confirmDeleteUser;
        openModal('confirmModal');
    }

    async function confirmDelete() {
        try {
            await API.users.remove(deleteId);
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

    function detailUser(id) {
        const u = currentPageData.find(u => u.id === id);
        if (!u) return;
        document.getElementById('detailUserName').textContent = u.name || u.username || '-';
        document.getElementById('detailUserPassword').textContent = u.password || '-';
        document.getElementById('detailUserRole').textContent = u.role || '-';
        document.getElementById('detailUserEmail').textContent = u.email || '-';
        document.getElementById('detailUserJoinDate').textContent = u.joinDate || u.created_at || '-';
        document.getElementById('detailUserBio').textContent = u.bio || '-';
        openModal('userDetailModal');
    }

    window.editUser = function(id) { openUserModal(id); };
    window.deleteUser = deleteUser;
    window.detailUser = detailUser;
    window._userGoPage = function(page) {
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

