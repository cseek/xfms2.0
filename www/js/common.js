/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:29:27
 * @Description: 全局数据管理和工具函数，提供统一的数据访问接口和常用的格式化函数，供各页面脚本调用，避免重复代码和全局变量污染
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */

let projects = [];
let modules = [];
let firmware = [];
let users = [];
let currentLang = localStorage.getItem('firmwareLang') || 'zh';

// 数据管理类（API 版本）
class DataManager {
    /**
     * 从后端 API 加载所有数据，返回 Promise<{projects, modules, firmware, users, currentLang}>
     */
    static async loadData() {
        try {
            const [proj, mods, fws, usrs] = await Promise.all([
                API.projects.list(),
                API.modules.list(),
                API.firmwares.list(),
                API.users.list()
            ]);
            projects = proj || [];
            modules  = mods || [];
            firmware = fws  || [];
            users    = usrs || [];
        } catch (e) {
            console.error('加载数据失败:', e);
            projects = []; modules = []; firmware = []; users = [];
        }
        return { projects, modules, firmware, users, currentLang };
    }

    /** 仅刷新固件列表（用于固件页和 Dashboard） */
    static async reloadFirmware() {
        try { firmware = (await API.firmwares.list()) || []; } catch(e) { console.error(e); }
        return firmware;
    }

    /** 仅刷新项目列表 */
    static async reloadProjects() {
        try { projects = (await API.projects.list()) || []; } catch(e) { console.error(e); }
        return projects;
    }

    /** 仅刷新模块列表 */
    static async reloadModules() {
        try { modules = (await API.modules.list()) || []; } catch(e) { console.error(e); }
        return modules;
    }

    /** 仅刷新用户列表 */
    static async reloadUsers() {
        try { users = (await API.users.list()) || []; } catch(e) { console.error(e); }
        return users;
    }

    /** 保留 saveData 空实现，防止旧调用报错 */
    static saveData() {}
}

// 工具函数
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
