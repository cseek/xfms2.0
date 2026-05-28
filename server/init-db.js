/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-15 01:01:58
 * @Description: 数据库初始化脚本，负责创建SQLite数据库文件和必要的表结构，并插入默认数据（如管理员账户和示例项目/模块），确保系统在首次运行时有一个可用的数据库环境
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/xfms.db');

// 与 app.js 保持一致的日志工具
function timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 23);
}
const logger = {
    info:  (...a) => console.log( `[${timestamp()}] [INFO]`,  ...a),
    warn:  (...a) => console.warn( `[${timestamp()}] [WARN]`,  ...a),
    error: (...a) => console.error(`[${timestamp()}] [ERROR]`, ...a),
    debug: (...a) => console.log( `[${timestamp()}] [DEBUG]`, ...a),
};

function initDatabase() {
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            logger.error('打开数据库错误:', err.message);
            return;
        }
        logger.info('已连接到SQLite数据库: ' + dbPath);
    });

    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('管理员', '开发者', '测试员', '普通用户')),
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            logger.error('创建users表错误:', err.message);
        } else {
            logger.info('users表已创建或已存在');
            // 兼容迁移：添加 bio 列
            db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, () => {});
        }
    });

    // 模块表
    db.run(`CREATE TABLE IF NOT EXISTS modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        project_id INTEGER,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )`, (err) => {
        if (err) {
            logger.error('创建modules表错误:', err.message);
        } else {
            logger.info('modules表已创建或已存在');
            // 兼容迁移：如果已有旧表，尝试添加 project_id 列
            db.run(`ALTER TABLE modules ADD COLUMN project_id INTEGER`, () => {});
        }
    });

    // 项目表
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(created_by) REFERENCES users(id)
    )`, (err) => {
        if (err) {
            logger.error('创建projects表错误:', err.message);
        } else {
            logger.info('projects表已创建或已存在');
        }
    });

    // 系统设置表
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`, (err) => {
        if (err) {
            logger.error('创建settings表错误:', err.message);
        } else {
            logger.info('settings表已创建或已存在');
            // 插入默认设置（如果不存在）
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('defaultLanguage', 'zh')`, () => {});
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('maxFileSize', '100')`, () => {});
            db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('loginCount', '0')`, () => {});
        }
    });

    // 固件表
    db.run(`CREATE TABLE IF NOT EXISTS firmwares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        module_id INTEGER,
        project_id INTEGER,
        version TEXT NOT NULL,
        description TEXT,
        file_path TEXT,
        file_size INTEGER,
        md5 TEXT,
        status TEXT DEFAULT '待测试' CHECK(status IN ('待测试', '已测试', '已激活', '已废弃')),
        uploaded_by INTEGER,
        tester_id INTEGER,
        test_report_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(module_id) REFERENCES modules(id),
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(uploaded_by) REFERENCES users(id),
        FOREIGN KEY(tester_id) REFERENCES users(id)
    )`, (err) => {
        if (err) {
            logger.error('创建firmwares表错误:', err.message);
        } else {
            logger.info('firmwares表已创建或已存在');
            // 兼容迁移：如果已有旧表，尝试添加 name 列
            db.run(`ALTER TABLE firmwares ADD COLUMN name TEXT`, () => {});
            // 兼容迁移：添加 md5 列
            db.run(`ALTER TABLE firmwares ADD COLUMN md5 TEXT`, () => {});
            // 表创建完成后，插入默认数据
            insertDefaultData(db);
        }
    });

    // 活动日志：记录上传/下载/修改/删除固件的操作
    db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,            -- upload/download/modify/delete
        actor_id INTEGER,
        actor_name TEXT,
        firmware_id INTEGER,
        firmware_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            logger.error('创建activity_logs表错误:', err.message);
        } else {
            logger.info('activity_logs表已创建或已存在');
        }
    });
}

function insertDefaultData(db) {
    // 仅在数据库中没有任何用户时才插入默认数据
    db.get(`SELECT COUNT(*) as count FROM users`, [], (err, row) => {
        if (err || (row && row.count > 0)) return;

        const adminUser = {
            username: 'admin',
            password: 'admin',
            role: '管理员',
            email: 'admin@xfms.com'
        };

        db.run(
            `INSERT OR IGNORE INTO users (username, password, role, email) 
             VALUES (?, ?, ?, ?)`,
            [adminUser.username, adminUser.password, adminUser.role, adminUser.email],
            function(err) {
                if (err) {
                    logger.error('插入admin用户错误:', err.message);
                } else {
                    logger.info('默认用户已插入');
                    insertDefaultProjects(db);
                }
            }
        );
    });
}

function insertDefaultProjects(db) {
    const defaultProjects = [
        { name: 'A101-无人机', description: '自主导航无人机项目' },
        { name: 'A102-搜救船', description: '自主导航搜救船项目' },
        { name: 'A103-物流车', description: '自主导航物流车项目' },
        { name: 'A104-割草机', description: '自主导航割草机项目' }
    ];

    defaultProjects.forEach((project) => {
        db.run(
            `INSERT OR IGNORE INTO projects (name, description, created_by) 
             VALUES (?, ?, (SELECT id FROM users WHERE username = 'admin'))`,
            [project.name, project.description],
            function(err) {
                if (err) {
                    logger.error(`插入项目 "${project.name}" 错误:`, err.message);
                } else {
                    logger.info(`插入项目 "${project.name}" 成功`);
                }
            }
        );
    });

    // 插入默认模块
    insertDefaultModules(db);
}

function insertDefaultModules(db) {
    const defaultModules = [
        { name: 'XnodeSdk', description: '通信组件' },
        { name: 'OtaServer', description: 'OTA服务器模块' },
        { name: 'LidarServer', description: '激光雷达服务器模块' },
        { name: 'GnssServer', description: 'GNSS服务器模块' },
        { name: 'ImuServer', description: 'IMU服务器模块' },
        { name: 'CameraServer', description: '摄像头服务器模块' },
        { name: 'OsImage', description: '内核镜像固件' }
    ];

    defaultModules.forEach((module) => {
        db.run(
            `INSERT OR IGNORE INTO modules (name, description, created_by) 
             VALUES (?, ?, (SELECT id FROM users WHERE username = 'admin'))`,
            [module.name, module.description],
            function(err) {
                if (err) {
                    logger.error(`插入模块 "${module.name}" 错误:`, err.message);
                } else {
                    logger.info(`插入模块 "${module.name}" 成功`);
                }
            }
        );
    });
}

// 导出初始化函数
module.exports = { initDatabase };

// 如果直接运行此脚本
if (require.main === module) {
    initDatabase();
}
