/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:28:03
 * @Description: 主框架页面脚本，负责用户认证守卫、导航交互、语言切换、用户信息显示等功能
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */

// ===== 未登录守卫：在任何脚本执行前立即检查 =====
(function authGuard() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
        const token = localStorage.getItem('authToken');
        if (!user || !user.id || !token) {
            window.location.replace('/login.html');
            return;
        }
        // 用原生 fetch 向服务端验证 token 是否仍有效（服务器重启后 sessions 会清空）
        fetch('/api/settings', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function(res) {
            if (res.status === 401) {
                localStorage.removeItem('currentUser');
                localStorage.removeItem('authToken');
                window.location.replace('/login.html');
            }
        }).catch(function() { /* 网络错误时不强制退出 */ });
    } catch (e) {
        window.location.replace('/login.html');
    }
})();

// 更新页面标题
function updatePageTitle(title) {
    document.getElementById('pageTitle').textContent = title;
}

// 菜单折叠功能
document.querySelectorAll('.nav-toggle').forEach(toggle => {
    toggle.addEventListener('click', function (e) {
        e.preventDefault();
        const submenuId = this.getAttribute('data-submenu');
        const submenu = document.getElementById(submenuId);
        const arrow = this.querySelector('.nav-arrow');
        
        submenu.classList.toggle('active');
        arrow.classList.toggle('active');
    });
});

// 导航切换
// Logo 图标点击跳转系统主页
document.getElementById('sidebarLogoIcon').addEventListener('click', function() {
    const dashLink = document.querySelector('.nav-link[data-page="dashboard"]');
    if (dashLink) dashLink.click();
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function (e) {
        const page = this.getAttribute('data-page');
        
        // 如果是折叠菜单的切换按钮，不进行页面切换
        if (!page) {
            return;
        }
        
        e.preventDefault();
        // 获取页面标题
        const title = currentLang === 'zh'
            ? this.getAttribute('data-title')
            : this.getAttribute('data-title-en');
        // 更新标题
        updatePageTitle(title);
        // 更新导航状态
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        // 加载页面
        document.getElementById('contentFrame').src = `pages/${page}.html`;
        // 移动端关闭菜单
        if (window.innerWidth <= 1024) {
            toggleMobileMenu();
        }
    });
});
// 移动端菜单
document.getElementById('mobileMenuBtn').addEventListener('click', toggleMobileMenu);
document.getElementById('mobileOverlay').addEventListener('click', toggleMobileMenu);
function toggleMobileMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('mobileOverlay').classList.toggle('active');
}
// 应用语言到主框架（供 iframe postMessage 调用）
function switchLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('firmwareLang', lang);
    applyLanguage(lang);
    // 同步更新页面标题
    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink) {
        const title = lang === 'zh'
            ? activeLink.getAttribute('data-title')
            : activeLink.getAttribute('data-title-en');
        updatePageTitle(title);
    }
    // 更新右上角用户角色显示（根据当前语言）
    updateUserRoleDisplay();
}
// 监听来自 iframe 的语言切换消息（系统设置页保存时触发）
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'languageChange') {
        switchLanguage(event.data.lang);
        // 再将消息转发给当前 iframe（非设置页的其他页面不需要转发，但设置页已处理）
        const iframe = document.getElementById('contentFrame');
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(event.data, '*');
        }
    }
});
// 退出登录
async function doLogout() {
    try { await API.auth.logout(); } catch(e) { /* ignore */ }
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
}

// ===== 用户下拉菜单 =====
const userDropdownTrigger = document.getElementById('userDropdownTrigger');
const userDropdownMenu    = document.getElementById('userDropdownMenu');

userDropdownTrigger.addEventListener('click', function (e) {
    e.stopPropagation();
    userDropdownMenu.classList.toggle('active');
});
document.addEventListener('click', function () {
    userDropdownMenu.classList.remove('active');
});

document.getElementById('logoutBtn').addEventListener('click', function () {
    userDropdownMenu.classList.remove('active');
    if (confirm('确认退出登录吗？')) doLogout();
});

// ===== 修改密码 =====
document.getElementById('changePasswordBtn').addEventListener('click', function () {
    userDropdownMenu.classList.remove('active');
    document.getElementById('cpOldPassword').value = '';
    document.getElementById('cpNewPassword').value = '';
    document.getElementById('cpConfirmPassword').value = '';
    document.getElementById('changePasswordModal').classList.add('active');
});
document.getElementById('closeChangePasswordModal').addEventListener('click', function () {
    document.getElementById('changePasswordModal').classList.remove('active');
});
document.getElementById('cancelChangePasswordBtn').addEventListener('click', function () {
    document.getElementById('changePasswordModal').classList.remove('active');
});
document.getElementById('saveChangePasswordBtn').addEventListener('click', async function () {
    const oldPwd  = document.getElementById('cpOldPassword').value;
    const newPwd  = document.getElementById('cpNewPassword').value;
    const confPwd = document.getElementById('cpConfirmPassword').value;
    if (!oldPwd)  { alert('请输入原密码'); return; }
    if (!newPwd)  { alert('请输入新密码'); return; }
    if (newPwd !== confPwd) { alert('两次输入的新密码不一致'); return; }

    const userInfo = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!userInfo) { alert('用户信息丢失，请重新登录'); return; }
    if (oldPwd !== userInfo.password) { alert('原密码不正确'); return; }

    try {
        await API.users.update(userInfo.id, {
            username: userInfo.username,
            email:    userInfo.email    || '',
            role:     userInfo.role     || '',
            bio:      userInfo.bio      || '',
            password: newPwd
        });
        // 同步本地缓存
        userInfo.password = newPwd;
        localStorage.setItem('currentUser', JSON.stringify(userInfo));
        alert('密码修改成功');
        document.getElementById('changePasswordModal').classList.remove('active');
    } catch(e) {
        alert(e.message || '修改失败');
    }
});
// 页面加载时应用语言并显示用户名
document.addEventListener('DOMContentLoaded', function () {
    applyLanguage(currentLang);
    const userInfo = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (userInfo && userInfo.username) {
        const el = document.getElementById('userName');
        if (el) el.textContent = userInfo.username;
        const av = document.querySelector('.user-avatar');
        if (av) av.textContent = userInfo.username.charAt(0).toUpperCase();
    }
    // 显示用户角色
    updateUserRoleDisplay();
    // 初始化语言切换按鈕状态
    updateLangToggleUI(currentLang);
});

function updateLangToggleUI(lang) {
    const zh = document.getElementById('langOptZh');
    const en = document.getElementById('langOptEn');
    if (!zh || !en) return;
    zh.classList.toggle('active', lang === 'zh');
    en.classList.toggle('active', lang === 'en');
}

function _translateRoleName(role, lang) {
    if (!role) return '';
    const t = translations[lang] || translations['zh'];
    // map known role names (both zh and en) to translation keys
    const mapping = {
        '管理员': 'roleAdmin', 'Administrator': 'roleAdmin',
        '开发者': 'roleDeveloper', 'Developer': 'roleDeveloper',
        '测试员': 'roleTester', 'Tester': 'roleTester',
        '普通用户': 'roleUser', 'User': 'roleUser'
    };
    const key = mapping[role] || mapping[role.trim()];
    if (key && t[key]) return t[key];
    return role;
}

function updateUserRoleDisplay() {
    try {
        const userInfo = JSON.parse(localStorage.getItem('currentUser') || 'null');
        const el = document.getElementById('userRole');
        if (!el) return;
        if (!userInfo || !userInfo.role) {
            el.textContent = '';
            return;
        }
        el.textContent = _translateRoleName(userInfo.role, currentLang);
    } catch (e) { /* ignore */ }
}

document.getElementById('sidebarLangToggle').addEventListener('click', function(e) {
    const opt = e.target.closest('.sidebar-lang-opt');
    if (!opt) return;
    const lang = opt.getAttribute('data-lang');
    if (lang && lang !== currentLang) {
        switchLanguage(lang);
        updateLangToggleUI(lang);
        // 广播给 iframe
        const iframe = document.getElementById('contentFrame');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'languageChange', lang }, '*');
        }
    }
});