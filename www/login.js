/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:28:38
 * @Description: 登录页面脚本，负责语言切换、表单交互、登录验证等功能
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */

// ===== 登录页语言切换 =====
const LOGIN_TEXTS = {
    zh: {
        pageTitle:   'X-固件管理系统 - 登录',
        title:       'X-固件管理系统',
        subtitle:    'X Firmware Management System',
        userLabel:   '用户',
        userPlaceholder: '请输入用户',
        passLabel:   '密码',
        passPlaceholder: '请输入密码',
        register:    '注册用户',
        forgot:      '忘记密码?',
        loginBtn:    '登录',
        loginSuccess: '登录成功！正在跳转...',
    },
    en: {
        pageTitle:   'X-FMS - Login',
        title:       'X-FMS',
        subtitle:    'X Firmware Management System',
        userLabel:   'Username',
        userPlaceholder: 'Enter username',
        passLabel:   'Password',
        passPlaceholder: 'Enter password',
        register:    'Register',
        forgot:      'Forgot Password?',
        loginBtn:    'Login',
        loginSuccess: 'Login successful! Redirecting...',
    }
};

function applyLoginLang(lang) {
    const t = LOGIN_TEXTS[lang] || LOGIN_TEXTS.zh;
    document.title = t.pageTitle;
    const h1 = document.querySelector('.login-header h1');
    const sub = document.querySelector('.login-header p');
    const uLabel = document.querySelector('label[for="username"]');
    const pLabel = document.querySelector('label[for="password"]');
    const uInput = document.getElementById('username');
    const pInput = document.getElementById('password');
    const regLink = document.getElementById('registerLink');
    const forgotLink = document.getElementById('forgotPasswordLink');
    const btnText = document.querySelector('.login-btn .btn-text');

    if (h1) h1.textContent = t.title;
    if (sub) sub.textContent = t.subtitle;
    if (uLabel) uLabel.childNodes[uLabel.childNodes.length - 1].textContent = ' ' + t.userLabel;
    if (pLabel) pLabel.childNodes[pLabel.childNodes.length - 1].textContent = ' ' + t.passLabel;
    if (uInput) uInput.placeholder = t.userPlaceholder;
    if (pInput) pInput.placeholder = t.passPlaceholder;
    if (regLink) regLink.textContent = t.register;
    if (forgotLink) forgotLink.textContent = t.forgot;
    if (btnText) btnText.textContent = t.loginBtn;

    // 更新按钮激活状态
    document.querySelectorAll('#loginLangToggle .login-lang-opt').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-lang') === lang);
    });
    localStorage.setItem('firmwareLang', lang);
}

(function initLoginLang() {
    const saved = localStorage.getItem('firmwareLang') || 'zh';
    applyLoginLang(saved);
    const toggle = document.getElementById('loginLangToggle');
    if (toggle) {
        toggle.addEventListener('click', function(e) {
            const opt = e.target.closest('.login-lang-opt');
            if (!opt) return;
            applyLoginLang(opt.getAttribute('data-lang'));
        });
    }
})();

// 简单的消息显示函数（因为登录页面不加载 common.js）
function showMessage(message, type = 'info') {
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.animation = 'messageSlideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// 输入验证函数
function validateInput(input) {
    const formGroup = input.closest('.form-group');
    if (input.value.trim() === '') {
        formGroup.classList.add('error');
        formGroup.classList.remove('success');
        return false;
    } else {
        formGroup.classList.remove('error');
        formGroup.classList.add('success');
        return true;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.querySelector('.toggle-password');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const registerLink = document.getElementById('registerLink');
    
    // 注册用户点击事件
    if (registerLink) {
        registerLink.addEventListener('click', function(e) {
            e.preventDefault();
            showMessage('请联系管理员注册用户', 'info');
        });
    }
    
    // 忘记密码点击事件
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            showMessage('请联系管理员找回密码', 'info');
        });
    }
    
    // 密码显示/隐藏功能
    if (togglePasswordBtn) {
        togglePasswordBtn.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // 切换图标（使用简单的方式）
            if (type === 'text') {
                this.innerHTML = `
                    <svg class="eye-icon" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M1 12C1 12 5 20 12 20C19 20 23 12 23 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                `;
                this.setAttribute('aria-label', '隐藏密码');
            } else {
                this.innerHTML = `
                    <svg class="eye-icon" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                `;
                this.setAttribute('aria-label', '显示密码');
            }
        });
    }
    
    // 输入实时验证
    usernameInput.addEventListener('blur', function() {
        validateInput(this);
    });
    
    passwordInput.addEventListener('blur', function() {
        validateInput(this);
    });
    
    // 清除错误状态
    usernameInput.addEventListener('focus', function() {
        this.closest('.form-group').classList.remove('error');
    });
    
    passwordInput.addEventListener('focus', function() {
        this.closest('.form-group').classList.remove('error');
    });
    
    // 表单提交
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        // 验证输入
        const isUsernameValid = validateInput(usernameInput);
        const isPasswordValid = validateInput(passwordInput);
        
        if (!isUsernameValid || !isPasswordValid) {
            showMessage('请填写完整的登录信息', 'warning');
            return;
        }
        
        const loginBtn = document.querySelector('.login-btn');
        const originalText = loginBtn.textContent;
        
        try {
            // 显示加载状态
            loginBtn.classList.add('loading');
            loginBtn.disabled = true;
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                const currentLang = localStorage.getItem('firmwareLang') || 'zh';
                const t = LOGIN_TEXTS[currentLang] || LOGIN_TEXTS.zh;
                showMessage(t.loginSuccess, 'success');
                
                // 清除之前保存的菜单状态，确保登录后菜单都是折叠的
                localStorage.removeItem('sidebarMenuState');
                // 保存当前登录用户信息和认证 token
                localStorage.setItem('currentUser', JSON.stringify(data.data));
                localStorage.setItem('authToken', data.data.token);
                
                // 添加成功动画效果
                loginBtn.classList.remove('loading');
                loginBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" style="width: 24px; height: 24px; display: inline-block;">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                `;
                
                setTimeout(() => {
                    // 登录成功后跳转到系统主页
                    window.location.href = '/index';
                }, 1000);
            } else {
                showMessage(data.error || '登录失败，请检查用户和密码', 'error');
                
                // 抖动效果
                loginBtn.style.animation = 'shake 0.4s';
                setTimeout(() => {
                    loginBtn.style.animation = '';
                }, 400);
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('网络错误，请检查连接后重试', 'error');
        } finally {
            if (!document.querySelector('.login-btn svg')) {
                loginBtn.classList.remove('loading');
                loginBtn.disabled = false;
                loginBtn.innerHTML = `<span class="btn-text">${originalText}</span><span class="btn-loader"></span>`;
            }
        }
    });
    
    // Enter 键快速登录
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
});

// 添加 CSS 动画
const style = document.createElement('style');
style.textContent = `
    @keyframes messageSlideOut {
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);