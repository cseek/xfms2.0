/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:28:03
 * @Description: 主框架页面脚本，负责用户认证守卫、路由导航、语言切换、用户信息显示等功能
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

window.XFMSPages = window.XFMSPages || {};

const ROUTES = {
    dashboard: {
        html: 'pages/dashboard.html',
        css: 'css/dashboard.css',
        js: 'js/dashboard.js',
        title: '系统主页',
        titleEn: 'Dashboard'
    },
    'firmware-release': {
        html: 'pages/firmware-release.html',
        css: 'css/firmware-release.css',
        js: 'js/firmware-release.js',
        title: '发布固件',
        titleEn: 'Release Firmware'
    },
    'firmware-list': {
        html: 'pages/firmware-list.html',
        css: 'css/firmware-list.css',
        js: 'js/firmware-list.js',
        title: '固件列表',
        titleEn: 'Firmware List'
    },
    'module-management': {
        html: 'pages/module-management.html',
        css: 'css/module-management.css',
        js: 'js/module-management.js',
        title: '模块管理',
        titleEn: 'Module Management'
    },
    'project-management': {
        html: 'pages/project-management.html',
        css: 'css/project-management.css',
        js: 'js/project-management.js',
        title: '项目管理',
        titleEn: 'Project Management'
    },
    'user-management': {
        html: 'pages/user-management.html',
        css: 'css/user-management.css',
        js: 'js/user-management.js',
        title: '用户管理',
        titleEn: 'User Management'
    },
    settings: {
        html: 'pages/settings.html',
        css: 'css/settings.css',
        js: 'js/settings.js',
        title: '系统设置',
        titleEn: 'System Settings'
    }
};

let activePage = null;
let routeRequestId = 0;
const mobileLayoutQuery = window.matchMedia('(max-width: 1200px)');

// 更新页面标题
function updatePageTitle(title) {
    document.getElementById('pageTitle').textContent = title;
}

function getRouteFromHash() {
    const raw = (window.location.hash || '#dashboard').replace(/^#\/?/, '');
    const page = raw.split('?')[0] || 'dashboard';
    return ROUTES[page] ? page : 'dashboard';
}

function getRouteTitle(page) {
    const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (activeLink) {
        return currentLang === 'zh'
            ? activeLink.getAttribute('data-title')
            : activeLink.getAttribute('data-title-en');
    }
    const route = ROUTES[page] || ROUTES.dashboard;
    return currentLang === 'zh' ? route.title : route.titleEn;
}

function setActiveNavigation(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-page') === page);
    });

    const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    const submenu = activeLink ? activeLink.closest('.nav-submenu') : null;
    if (submenu) {
        submenu.classList.add('active');
        const toggle = document.querySelector(`.nav-toggle[data-submenu="${submenu.id}"]`);
        if (toggle) {
            const arrow = toggle.querySelector('.nav-arrow');
            if (arrow) arrow.classList.add('active');
        }
    }
    updatePageTitle(getRouteTitle(page));
}

function setMobileMenuState(isOpen) {
    document.getElementById('sidebar').classList.toggle('active', isOpen);
    document.getElementById('mobileOverlay').classList.toggle('active', isOpen);
    document.getElementById('mobileMenuBtn').setAttribute('aria-expanded', String(isOpen));
}

function closeMobileMenu() {
    setMobileMenuState(false);
}

function ensureStyle(href) {
    document.querySelectorAll('link[data-route-style]').forEach(link => {
        if (link.getAttribute('data-route-style') !== href) {
            link.remove();
        }
    });
    if (!href || document.querySelector(`link[data-route-style="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-route-style', href);
    document.head.appendChild(link);
}

function ensureScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-route-script="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.setAttribute('data-route-script', src);
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function extractPageBody(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script').forEach(script => script.remove());
    return doc.body ? doc.body.innerHTML : html;
}

async function loadRoute(page) {
    const route = ROUTES[page] || ROUTES.dashboard;
    const requestId = ++routeRequestId;
    const view = document.getElementById('routeView');

    if (activePage) {
        const currentModule = window.XFMSPages[activePage];
        if (currentModule && typeof currentModule.destroy === 'function') {
            currentModule.destroy();
        }
    }

    activePage = page;
    setActiveNavigation(page);
    view.innerHTML = '<div class="route-loading">加载中...</div>';

    try {
        ensureStyle(route.css);
        const res = await fetch(route.html, {
            credentials: 'same-origin',
            headers: { 'X-Route-Template': '1' }
        });
        if (!res.ok) throw new Error('页面加载失败');
        const html = await res.text();
        if (requestId !== routeRequestId) return;

        view.innerHTML = extractPageBody(html);
        view.scrollTop = 0;
        applyLanguage(currentLang);

        await ensureScript(route.js);
        if (requestId !== routeRequestId) return;

        const pageModule = window.XFMSPages[page];
        if (pageModule && typeof pageModule.init === 'function') {
            await pageModule.init();
        }
    } catch (e) {
        console.error('路由加载失败:', e);
        if (requestId === routeRequestId) {
            view.innerHTML = '<div class="route-error">页面加载失败，请刷新后重试。</div>';
        }
    }
}

function navigateTo(page) {
    if (!ROUTES[page]) page = 'dashboard';
    const nextHash = `#${page}`;
    if (window.location.hash === nextHash) {
        loadRoute(page);
    } else {
        window.location.hash = nextHash;
    }
    if (mobileLayoutQuery.matches) closeMobileMenu();
}

window.XFMSRouter = {
    navigate: navigateTo,
    setLanguage: switchLanguage,
    getCurrentPage: () => activePage
};

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

// Logo 图标点击跳转系统主页
document.getElementById('sidebarLogoIcon').addEventListener('click', function() {
    navigateTo('dashboard');
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function (e) {
        const page = this.getAttribute('data-page');
        if (!page) return;

        e.preventDefault();
        navigateTo(page);
    });
});

// 移动端菜单
document.getElementById('mobileMenuBtn').addEventListener('click', toggleMobileMenu);
document.getElementById('mobileOverlay').addEventListener('click', closeMobileMenu);
function toggleMobileMenu() {
    const isOpen = !document.getElementById('sidebar').classList.contains('active');
    setMobileMenuState(isOpen);
}

function handleMobileLayoutChange() {
    closeMobileMenu();
}

if (typeof mobileLayoutQuery.addEventListener === 'function') {
    mobileLayoutQuery.addEventListener('change', handleMobileLayoutChange);
} else {
    mobileLayoutQuery.addListener(handleMobileLayoutChange);
}

function notifyActivePageLanguage(lang) {
    const pageModule = activePage && window.XFMSPages[activePage];
    if (pageModule && typeof pageModule.onLanguageChange === 'function') {
        pageModule.onLanguageChange(lang);
    }
}

// 应用语言到主框架和当前路由页
function switchLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('firmwareLang', lang);
    applyLanguage(lang);
    updatePageTitle(getRouteTitle(activePage || getRouteFromHash()));
    updateUserRoleDisplay();
    updateLangToggleUI(lang);
    notifyActivePageLanguage(lang);
}

window.addEventListener('hashchange', () => {
    loadRoute(getRouteFromHash());
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
    // 初始化语言切换按钮状态
    updateLangToggleUI(currentLang);
    loadRoute(getRouteFromHash());
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
    }
});
