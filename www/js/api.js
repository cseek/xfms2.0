/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:29:01
 * @Description: API 客户端脚本，封装与后端的所有交互请求，提供统一的接口调用方式，并在未登录或 token 过期时自动跳转到登录页
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */

const API = (() => {
    const BASE = '';   // 与后端同源，端口由 express 统一处理

    // 未登录时统一跳转到登录页（window.top 确保 iframe 内也能跳转顶层）
    function redirectToLogin() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
        window.top.location.replace('/login.html');
    }

    async function request(method, url, body, isFile) {
        const opts = { method, headers: {} };
        // 携带认证 token
        const token = localStorage.getItem('authToken');
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        if (body) {
            if (isFile) {
                opts.body = body; // FormData，勿设 Content-Type
            } else {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
        }
        const res = await fetch(BASE + url, opts);
        const json = await res.json();
        // 401 = 未登录/token 过期，立即跳转
        if (res.status === 401 || json.code === 401) {
            redirectToLogin();
            throw new Error('未登录');
        }
        if (!res.ok || json.code >= 400) {
            throw new Error(json.message || '请求失败');
        }
        return json.data;
    }

    // ========== 项目 ==========
    const projects = {
        list:   ()            => request('GET',    '/api/project'),
        page:   (params)      => request('GET',    '/api/project?' + new URLSearchParams(
                                    Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v !== null && v !== undefined))
                                )),
        create: (data)        => request('POST',   '/api/project', data),
        update: (id, data)    => request('PUT',    `/api/project/${id}`, data),
        remove: (id)          => request('DELETE', `/api/project/${id}`)
    };

    // ========== 模块 ==========
    const modules = {
        list:   ()            => request('GET',    '/api/module'),
        page:   (params)      => request('GET',    '/api/module?' + new URLSearchParams(
                                    Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v !== null && v !== undefined))
                                )),
        create: (data)        => request('POST',   '/api/module', data),
        update: (id, data)    => request('PUT',    `/api/module/${id}`, data),
        remove: (id)          => request('DELETE', `/api/module/${id}`)
    };

    // ========== 用户 ==========
    const users = {
        list:   ()            => request('GET',    '/api/user'),
        page:   (params)      => request('GET',    '/api/user?' + new URLSearchParams(
                                    Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v !== null && v !== undefined))
                                )),
        create: (data)        => request('POST',   '/api/user', data),
        update: (id, data)    => request('PUT',    `/api/user/${id}`, data),
        remove: (id)          => request('DELETE', `/api/user/${id}`)
    };

    // ========== 固件 ==========
    const firmwares = {
        list:   ()            => request('GET',    '/api/firmware'),
        page:   (params)      => request('GET',    '/api/firmware?' + new URLSearchParams(
                                    Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v !== null && v !== undefined))
                                )),
        create: (formData)    => request('POST',   '/api/firmware', formData, true),
        update: (id, data)    => request('PUT',    `/api/firmware/${id}`, data),
        remove: (id)          => request('DELETE', `/api/firmware/${id}`),
        downloadUrl: (id)     => `/api/firmware/${id}/download`
    };

    // ========== 系统设置 ==========
    const settings = {
        get:  ()     => request('GET', '/api/settings'),
        save: (data) => request('PUT', '/api/settings', data)
    };

    // ========== 活动日志 ==========
    const activity = {
        recent: (limit = 20) => request('GET', `/api/activity-logs?limit=${limit}`)
    };

    // ========== 认证 ==========
    const auth = {
        logout: () => request('POST', '/api/logout')
    };

    return { projects, modules, users, firmwares, settings, auth, activity };
})();
