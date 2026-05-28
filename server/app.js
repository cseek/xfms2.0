/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:41:12
 * @Description: 主服务器应用，使用 Express 框架搭建，负责处理 API 请求、用户认证、文件上传、数据库交互等核心功能，同时提供统一的日志记录和错误处理机制，确保系统的稳定性和安全性
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { initDatabase } = require('./init-db');

const app = express();
const PORT = process.env.PORT || 3000;

// ===================== 日志工具 =====================
const LOG_LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG' };
function timestamp() {
    return new Date().toISOString().replace('T', ' ').substring(0, 23);
}
function log(level, ...args) {
    const prefix = `[${timestamp()}] [${level}]`;
    if (level === LOG_LEVELS.ERROR) {
        console.error(prefix, ...args);
    } else if (level === LOG_LEVELS.WARN) {
        console.warn(prefix, ...args);
    } else {
        console.log(prefix, ...args);
    }
}
const logger = {
    info:  (...a) => log(LOG_LEVELS.INFO,  ...a),
    warn:  (...a) => log(LOG_LEVELS.WARN,  ...a),
    error: (...a) => log(LOG_LEVELS.ERROR, ...a),
    debug: (...a) => log(LOG_LEVELS.DEBUG, ...a),
};

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ===================== 请求日志中间件 =====================
app.use((req, res, next) => {
    const start = Date.now();
    const { method, originalUrl } = req;

    // 打印请求体（跳过文件上传，避免刷屏）
    const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
    if (!isMultipart && req.body && Object.keys(req.body).length > 0) {
        const safeBody = { ...req.body };
        if (safeBody.password) safeBody.password = '******';
        logger.debug(`→ ${method} ${originalUrl}`, 'Body:', JSON.stringify(safeBody));
    } else {
        logger.info(`→ ${method} ${originalUrl}`);
    }

    // 拦截 res.json 记录响应
    const origJson = res.json.bind(res);
    res.json = (body) => {
        const ms = Date.now() - start;
        const code = body && body.code !== undefined ? body.code : res.statusCode;
        const level = code >= 500 ? 'ERROR' : code >= 400 ? 'WARN' : 'INFO';
        log(level, `← ${method} ${originalUrl} [${code}] ${ms}ms`);
        if (code >= 400) {
            log(level, '  响应:', JSON.stringify(body));
        }
        return origJson(body);
    };

    next();
});
// 根路径重定向到登录页
app.get('/', (req, res) => {
    res.redirect('/login.html');
});
app.use(express.static(path.join(__dirname, '../www'), { index: false }));

// 数据库连接
const dbPath = path.join(__dirname, '../database/xfms.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        logger.error('数据库连接失败:', err.message);
    } else {
        logger.info(`数据库连接成功: ${dbPath}`);
    }
});

// 初始化数据库
logger.info('正在初始化数据库...');
initDatabase();

// multer 文件上传配置
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const now = new Date();
        const pad2 = n => String(n).padStart(2, '0');
        const pad3 = n => String(n).padStart(3, '0');
        const subdir = `${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}${pad3(now.getMilliseconds())}`;
        const dest = path.join(uploadDir, subdir);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, originalName);
    }
});
// 服务端硬上限 1 GB（实际由客户端 maxFileSize 设置控制）
const upload = multer({ storage, limits: { fileSize: 1 * 1024 * 1024 * 1024 } });

// ===================== 状态值映射 =====================
const DB_TO_FE = { '待测试': 'pending', '已测试': 'tested', '已激活': 'activated', '已废弃': 'deprecated' };
const FE_TO_DB = { pending: '待测试', tested: '已测试', activated: '已激活', deprecated: '已废弃' };
function mapStatus(row) {
    if (row && row.status) row.status = DB_TO_FE[row.status] || row.status;
    return row;
}
function toDbStatus(feStatus) {
    return FE_TO_DB[feStatus] || feStatus || '待测试';
}

// 固件版本格式：V主版本.次版本.修订版本（可选.构建号），V 前缀可省略
const FIRMWARE_VERSION_REGEX = /^V?\d+\.\d+\.\d+(\.\d+)?$/;

// ==================== Token 会话存储 ====================
// 内存 Map：token -> { userId, username, role, createdAt, lastActivityAt }
// 生产环境可替换为 Redis；进程重启后所有用户需重新登录（符合预期）
const sessions = new Map();
// 会话空闲超时：5 分钟无操作自动过期（滑动过期）
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 60 * 1000;

function isSessionExpired(session) {
    if (!session || !session.lastActivityAt) return true;
    return (Date.now() - session.lastActivityAt) > SESSION_IDLE_TIMEOUT_MS;
}

function touchSession(token) {
    const session = sessions.get(token);
    if (session) {
        session.lastActivityAt = Date.now();
        sessions.set(token, session);
    }
}

// 定时清理过期会话，避免长期运行时内存堆积
setInterval(() => {
    let removed = 0;
    for (const [token, session] of sessions.entries()) {
        if (isSessionExpired(session)) {
            sessions.delete(token);
            removed += 1;
        }
    }
    if (removed > 0) {
        logger.info(`会话清理完成，移除 ${removed} 个过期会话，剩余 ${sessions.size} 个活跃会话`);
    }
}, SESSION_SWEEP_INTERVAL_MS);

// ==================== API 路由 ====================

// 登录接口 (支持两种路径)
function handleLogin(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ code: 400, message: '用户名和密码不能为空', data: null });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            return res.status(500).json({ code: 500, message: '服务器错误', data: null });
        }
        if (!user || user.password !== password) {
            return res.status(401).json({ code: 401, message: '用户名或密码错误', error: '用户名或密码错误', data: null });
        }
        // 生成随机 token
        const token = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        sessions.set(token, {
            userId: user.id,
            username: user.username,
            role: user.role,
            createdAt: now,
            lastActivityAt: now,
        });
        logger.info(`用户登录成功: ${user.username}，共 ${sessions.size} 个活跃会话`);
        // 累计访问计数
        db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('loginCount', CAST(COALESCE((SELECT value FROM settings WHERE key = 'loginCount'), '0') AS INTEGER) + 1)`, [], (err) => {
            if (err) logger.warn('更新 loginCount 失败:', err.message);
        });
        res.json({
            code: 200,
            message: '登录成功',
            data: { id: user.id, username: user.username, role: user.role, email: user.email, password: user.password, token }
        });
    });
}
app.post('/api/login', handleLogin);
app.post('/api/auth/login', handleLogin);

// 退出登录 — 销毁 token
app.post('/api/logout', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token && sessions.has(token)) {
        const info = sessions.get(token);
        sessions.delete(token);
        logger.info(`用户退出登录: ${info.username}，剩余 ${sessions.size} 个活跃会话`);
    }
    res.json({ code: 200, message: '已退出登录', data: null });
});

// ==================== 认证中间件（保护以下所有 /api/* 路由）====================
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ code: 401, message: '未登录或登录已过期，请重新登录', data: null });
    }

    const session = sessions.get(token);
    if (isSessionExpired(session)) {
        sessions.delete(token);
        logger.info(`会话超时，自动退出: ${session && session.username}`);
        return res.status(401).json({ code: 401, message: '会话超时（5分钟无操作），请重新登录', data: null });
    }

    touchSession(token);
    req.currentUser = sessions.get(token);
    next();
}

// ==================== 角色授权中间件 ====================
// 用法: requireRole('管理员', '开发者') — 只有指定角色才能继续
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        const role = req.currentUser && req.currentUser.role;
        if (!role || !allowedRoles.includes(role)) {
            logger.warn(`权限拒绝: 用户 "${req.currentUser && req.currentUser.username}" (角色: ${role}) 尝试访问 ${req.method} ${req.originalUrl}`);
            return res.status(403).json({ code: 403, message: '权限不足，无法执行此操作', data: null });
        }
        next();
    };
}
app.use('/api', requireAuth);

// /index 路由 → 由客户端 JS 负责未登录跳转，此处直接服务静态文件即可
// （express.static 已在上方挂载，这里保留路由以支持不带 .html 的访问）
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, '../www/index.html'));
});

// ==================== 系统设置 ====================

// 记录活动日志的助手（action: upload/download/modify/delete）
function insertActivity(action, actorId, actorName, firmwareId, firmwareName) {
    try {
        db.run(`INSERT INTO activity_logs (action, actor_id, actor_name, firmware_id, firmware_name) VALUES (?, ?, ?, ?, ?)`,
            [action, actorId || null, actorName || null, firmwareId || null, firmwareName || null], (err) => {
                if (err) logger.warn('写入 activity_logs 失败:', err.message);
        });
    } catch (e) {
        logger.warn('写入 activity_logs 异常:', e.message);
    }
}

// 获取最近活动日志（按时间倒序）
app.get('/api/activity-logs', (req, res) => {
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    db.all(`
        SELECT a.id, a.action, a.actor_id, a.actor_name, a.firmware_id, a.firmware_name, a.created_at,
               f.version, p.name AS project_name, m.name AS module_name
        FROM activity_logs a
        LEFT JOIN firmwares f ON a.firmware_id = f.id
        LEFT JOIN projects  p ON f.project_id  = p.id
        LEFT JOIN modules   m ON f.module_id   = m.id
        ORDER BY a.created_at DESC LIMIT ?`, [limit], (err, rows) => {
        if (err) return res.status(500).json({ code: 500, message: '获取活动日志失败', data: null });
        res.json({ code: 200, message: '获取活动日志成功', data: rows });
    });
});

// GET 获取所有设置
app.get('/api/settings', (req, res) => {
    db.all(`SELECT key, value FROM settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ code: 500, message: '获取设置失败', data: null });
        const settings = {};
        (rows || []).forEach(r => { settings[r.key] = r.value; });
        res.json({ code: 200, message: '获取设置成功', data: settings });
    });
});

// PUT 保存设置
// 说明：仅管理员可修改任何设置
app.put('/api/settings', (req, res) => {
    const role = req.currentUser && req.currentUser.role;
    if (role !== '管理员') {
        logger.warn(`权限拒绝: 非管理员用户 ${req.currentUser && req.currentUser.username} 尝试修改设置`);
        return res.status(403).json({ code: 403, message: '权限不足：仅管理员可修改系统设置', data: null });
    }
    const { defaultLanguage, maxFileSize } = req.body;
    const updates = [];

    if (defaultLanguage !== undefined) updates.push(['defaultLanguage', String(defaultLanguage)]);
    if (maxFileSize !== undefined) {
        updates.push(['maxFileSize', String(parseInt(maxFileSize) || 100)]);
    }

    if (updates.length === 0) return res.status(400).json({ code: 400, message: '没有可更新的设置项', data: null });

    let done = 0;
    let hasErr = false;
    updates.forEach(([key, value]) => {
        db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value], (err) => {
            if (err) hasErr = true;
            if (++done === updates.length) {
                if (hasErr) return res.status(500).json({ code: 500, message: '保存设置失败', data: null });
                logger.info(`设置已更新: ${updates.map(([k,v]) => `${k}=${v}`).join(', ')}`);
                res.json({ code: 200, message: '保存设置成功', data: null });
            }
        });
    });
});

// ==================== 项目 ====================

// GET 项目列表 (含模块数量和创建人名称)
app.get('/api/project', (req, res) => {
    const paginated = req.query.page !== undefined;
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 25);
    const { keyword } = req.query;

    const whereParts = [];
    const params = [];
    if (keyword) {
        whereParts.push('(p.name LIKE ? OR p.description LIKE ?)');
        const k = `%${keyword}%`;
        params.push(k, k);
    }
    const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
    const baseFrom = `FROM projects p LEFT JOIN users u ON p.created_by = u.id ${whereClause}`;
    const selectCols = `SELECT p.id, p.name, p.description, p.created_at,
                u.username as creator,
                (SELECT COUNT(DISTINCT f.module_id) FROM firmwares f WHERE f.project_id = p.id) as moduleCount`;

    function processRows(rows) {
        return (rows || []).map(r => ({ ...r, createdAt: r.created_at ? r.created_at.replace('T', ' ').substring(0, 19) : '', creator: r.creator || '管理员' }));
    }

    if (!paginated) {
        // 无分页参数：返回全量数组（供其他页面使用）
        db.all(`${selectCols} ${baseFrom} ORDER BY p.created_at DESC`, params, (err, rows) => {
            if (err) return res.status(500).json({ code: 500, message: '获取项目列表失败', data: null });
            res.json({ code: 200, message: '获取项目列表成功', data: processRows(rows) });
        });
    } else {
        // 有分页参数：返回 { list, total, page, pageSize, totalPages }
        db.get(`SELECT COUNT(*) as total ${baseFrom}`, params, (err, countRow) => {
            if (err) return res.status(500).json({ code: 500, message: '获取项目列表失败', data: null });
            const total      = countRow.total;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const offset     = (Math.min(page, totalPages) - 1) * pageSize;
            db.all(
                `${selectCols} ${baseFrom} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
                [...params, pageSize, offset],
                (err2, rows) => {
                    if (err2) return res.status(500).json({ code: 500, message: '获取项目列表失败', data: null });
                    res.json({ code: 200, message: '获取项目列表成功', data: {
                        list: processRows(rows), total, page: Math.min(page, totalPages), pageSize, totalPages
                    }});
                }
            );
        });
    }
});

// POST 新建项目
app.post('/api/project', requireRole('管理员'), (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '项目名称不能为空', data: null });
    db.run(
        `INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)`,
        [name, description || '', req.currentUser.userId],
        function(err) {
            if (err) {
                if (err.message && err.message.includes('UNIQUE')) {
                    return res.status(409).json({ code: 409, message: '创建失败，项目已存在', data: null });
                }
                return res.status(500).json({ code: 500, message: '创建项目失败', data: null });
            }
            db.get(
                `SELECT p.id, p.name, p.description, p.created_at, u.username as creator, 0 as moduleCount
                 FROM projects p LEFT JOIN users u ON p.created_by = u.id WHERE p.id = ?`,
                [this.lastID],
                (err2, row) => {
                    if (row) row.createdAt = row.created_at ? row.created_at.replace('T', ' ').substring(0, 19) : '';
                    res.json({ code: 200, message: '创建项目成功', data: row });
                }
            );
        }
    );
});

// PUT 更新项目
app.put('/api/project/:id', requireRole('管理员'), (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '项目名称不能为空', data: null });
    db.run(
        `UPDATE projects SET name = ?, description = ? WHERE id = ?`,
        [name, description || '', req.params.id],
        function(err) {
            if (err) return res.status(500).json({ code: 500, message: '更新项目失败', data: null });
            res.json({ code: 200, message: '更新项目成功', data: null });
        }
    );
});

// DELETE 删除项目
app.delete('/api/project/:id', requireRole('管理员'), (req, res) => {
    const id = req.params.id;
    db.get(`SELECT COUNT(*) as cnt FROM modules WHERE project_id = ?`, [id], (err, row) => {
        if (row && row.cnt > 0) {
            return res.status(400).json({ code: 400, message: '项目下存在模块，无法删除', data: null });
        }
        db.run(`DELETE FROM projects WHERE id = ?`, [id], function(err2) {
            if (err2) return res.status(500).json({ code: 500, message: '删除项目失败', data: null });
            res.json({ code: 200, message: '删除项目成功', data: null });
        });
    });
});

// ==================== 模块 ====================

// GET 模块列表 (含固件数量和创建人名称)
app.get('/api/module', (req, res) => {
    const paginated = req.query.page !== undefined;
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 25);
    const { keyword } = req.query;

    const whereParts = [];
    const params = [];
    if (keyword) {
        whereParts.push('(m.name LIKE ? OR m.description LIKE ?)');
        const k = `%${keyword}%`;
        params.push(k, k);
    }
    const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
    const baseFrom = `FROM modules m LEFT JOIN users u ON m.created_by = u.id ${whereClause}`;
    const selectCols = `SELECT m.id, m.name, m.description, m.created_at, m.project_id,
                u.username as creator,
                (SELECT COUNT(*) FROM firmwares f WHERE f.module_id = m.id) as firmwareCount`;

    function processRows(rows) {
        return (rows || []).map(r => ({ ...r, createdAt: r.created_at ? r.created_at.replace('T', ' ').substring(0, 19) : '', creator: r.creator || '管理员', projectId: r.project_id }));
    }

    if (!paginated) {
        // 无分页参数：返回全量数组（供其他页面使用）
        db.all(`${selectCols} ${baseFrom} ORDER BY m.created_at DESC`, params, (err, rows) => {
            if (err) return res.status(500).json({ code: 500, message: '获取模块列表失败', data: null });
            res.json({ code: 200, message: '获取模块列表成功', data: processRows(rows) });
        });
    } else {
        // 有分页参数：返回 { list, total, page, pageSize, totalPages }
        db.get(`SELECT COUNT(*) as total ${baseFrom}`, params, (err, countRow) => {
            if (err) return res.status(500).json({ code: 500, message: '获取模块列表失败', data: null });
            const total      = countRow.total;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const offset     = (Math.min(page, totalPages) - 1) * pageSize;
            db.all(
                `${selectCols} ${baseFrom} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
                [...params, pageSize, offset],
                (err2, rows) => {
                    if (err2) return res.status(500).json({ code: 500, message: '获取模块列表失败', data: null });
                    res.json({ code: 200, message: '获取模块列表成功', data: {
                        list: processRows(rows), total, page: Math.min(page, totalPages), pageSize, totalPages
                    }});
                }
            );
        });
    }
});

// POST 新建模块
app.post('/api/module', requireRole('管理员'), (req, res) => {
    const { name, description, project_id } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '模块名称不能为空', data: null });
    db.run(
        `INSERT INTO modules (name, description, project_id, created_by) VALUES (?, ?, ?, ?)`,
        [name, description || '', project_id || null, req.currentUser.userId],
        function(err) {
            if (err) {
                if (err.message && err.message.includes('UNIQUE')) {
                    return res.status(409).json({ code: 409, message: '创建失败，模块已存在', data: null });
                }
                return res.status(500).json({ code: 500, message: '创建模块失败', data: null });
            }
            db.get(
                `SELECT m.id, m.name, m.description, m.created_at, m.project_id, u.username as creator, 0 as firmwareCount
                 FROM modules m LEFT JOIN users u ON m.created_by = u.id WHERE m.id = ?`,
                [this.lastID],
                (err2, row) => {
                    if (row) row.createdAt = row.created_at ? row.created_at.replace('T', ' ').substring(0, 19) : '';
                    res.json({ code: 200, message: '创建模块成功', data: row });
                }
            );
        }
    );
});

// PUT 更新模块
app.put('/api/module/:id', requireRole('管理员'), (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ code: 400, message: '模块名称不能为空', data: null });
    db.run(
        `UPDATE modules SET name = ?, description = ? WHERE id = ?`,
        [name, description || '', req.params.id],
        function(err) {
            if (err) return res.status(500).json({ code: 500, message: '更新模块失败', data: null });
            res.json({ code: 200, message: '更新模块成功', data: null });
        }
    );
});

// DELETE 删除模块
app.delete('/api/module/:id', requireRole('管理员'), (req, res) => {
    const id = req.params.id;
    db.get(`SELECT COUNT(*) as cnt FROM firmwares WHERE module_id = ?`, [id], (err, row) => {
        if (row && row.cnt > 0) {
            return res.status(400).json({ code: 400, message: '模块下存在固件，无法删除', data: null });
        }
        db.run(`DELETE FROM modules WHERE id = ?`, [id], function(err2) {
            if (err2) return res.status(500).json({ code: 500, message: '删除模块失败', data: null });
            res.json({ code: 200, message: '删除模块成功', data: null });
        });
    });
});

// ==================== 用户 ====================

// GET 用户列表
app.get('/api/user', (req, res) => {
    const paginated = req.query.page !== undefined;
    const page     = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize) || 25);
    const { keyword } = req.query;

    const whereParts = [];
    const params = [];
    if (keyword) {
        whereParts.push('(username LIKE ? OR email LIKE ?)');
        const k = `%${keyword}%`;
        params.push(k, k);
    }
    const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
    const baseFrom = `FROM users ${whereClause}`;
    const selectCols = 'SELECT id, username, password, role, email, bio, created_at';

    function processRows(rows) {
        return (rows || []).map(r => ({ ...r, name: r.username, joinDate: r.created_at ? r.created_at.replace('T', ' ').substring(0, 19) : '' }));
    }

    if (!paginated) {
        db.all(`${selectCols} ${baseFrom} ORDER BY created_at DESC`, params, (err, rows) => {
            if (err) return res.status(500).json({ code: 500, message: '获取用户列表失败', data: null });
            res.json({ code: 200, message: '获取用户列表成功', data: processRows(rows) });
        });
    } else {
        db.get(`SELECT COUNT(*) as total ${baseFrom}`, params, (err, countRow) => {
            if (err) return res.status(500).json({ code: 500, message: '获取用户列表失败', data: null });
            const total      = countRow.total;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const offset     = (Math.min(page, totalPages) - 1) * pageSize;
            db.all(
                `${selectCols} ${baseFrom} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...params, pageSize, offset],
                (err2, rows) => {
                    if (err2) return res.status(500).json({ code: 500, message: '获取用户列表失败', data: null });
                    res.json({ code: 200, message: '获取用户列表成功', data: {
                        list: processRows(rows), total, page: Math.min(page, totalPages), pageSize, totalPages
                    }});
                }
            );
        });
    }
});

// POST 新建用户
app.post('/api/user', requireRole('管理员'), (req, res) => {
    const { username, email, role, password, bio } = req.body;
    if (!username || !email) return res.status(400).json({ code: 400, message: '用户名和邮箱不能为空', data: null });
    db.run(
        `INSERT INTO users (username, password, role, email, bio) VALUES (?, ?, ?, ?, ?)`,
        [username, password || '123456', role || '普通用户', email, bio || null],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ code: 400, message: '用户名已存在', data: null });
                return res.status(500).json({ code: 500, message: '创建用户失败', data: null });
            }
            db.get(`SELECT id, username, role, email, bio, created_at FROM users WHERE id = ?`, [this.lastID], (err2, row) => {
                if (row) { row.name = row.username; row.joinDate = (row.created_at || '').replace('T', ' ').substring(0, 19); }
                res.json({ code: 200, message: '创建用户成功', data: row });
            });
        }
    );
});

// PUT 更新用户
app.put('/api/user/:id', requireAuth, (req, res) => {
    const isSelf  = String(req.currentUser.userId) === String(req.params.id);
    const isAdmin = req.currentUser.role === '管理员';

    if (!isSelf && !isAdmin) {
        return res.status(403).json({ code: 403, message: '权限不足，无法执行此操作', data: null });
    }

    const { username, email, role, bio, password } = req.body;

    if (isSelf && !isAdmin) {
        // 普通用户只允许修改自己的密码
        if (!password) return res.status(400).json({ code: 400, message: '密码不能为空', data: null });
        db.run(`UPDATE users SET password = ? WHERE id = ?`, [password, req.params.id], function(err) {
            if (err) return res.status(500).json({ code: 500, message: '更新密码失败', data: null });
            res.json({ code: 200, message: '密码修改成功', data: null });
        });
        return;
    }

    // 管理员：完整更新
    if (!username || !email) return res.status(400).json({ code: 400, message: '用户名和邮箱不能为空', data: null });
    const fields = ['username = ?', 'email = ?', 'role = ?', 'bio = ?'];
    const values = [username, email, role || '普通用户', bio || null];
    if (password) {
        fields.push('password = ?');
        values.push(password);
    }
    values.push(req.params.id);
    db.run(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
            if (err) return res.status(500).json({ code: 500, message: '更新用户失败', data: null });
            res.json({ code: 200, message: '更新用户成功', data: null });
        }
    );
});

// DELETE 删除用户
app.delete('/api/user/:id', requireRole('管理员'), (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ code: 500, message: '删除用户失败', data: null });
        res.json({ code: 200, message: '删除用户成功', data: null });
    });
});

// ==================== 固件 ====================

// GET 固件列表 (含连表信息)
app.get('/api/firmware', (req, res) => {
    const paginated = req.query.page !== undefined;
    const page      = Math.max(1, parseInt(req.query.page)     || 1);
    const pageSize  = Math.max(1, parseInt(req.query.pageSize) || 25);
    const { projectId, moduleId, status, keyword } = req.query;

    const whereParts = [];
    const params = [];
    if (projectId) { whereParts.push('f.project_id = ?'); params.push(projectId); }
    if (moduleId)  { whereParts.push('f.module_id = ?');  params.push(moduleId);  }
    if (status)    { whereParts.push('f.status = ?');     params.push(toDbStatus(status)); }
    if (keyword) {
        whereParts.push('(f.version LIKE ? OR f.description LIKE ? OR p.name LIKE ? OR m.name LIKE ?)');
        const k = `%${keyword}%`;
        params.push(k, k, k, k);
    }
    const whereClause = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
    const baseFrom = `FROM firmwares f
         LEFT JOIN projects p ON f.project_id = p.id
         LEFT JOIN modules m ON f.module_id = m.id
         ${whereClause}`;
    const selectCols = `SELECT f.id, f.name, f.version, f.description, f.file_size, f.file_path, f.md5, f.status,
                f.module_id, f.project_id, f.created_at, f.updated_at,
                p.name as projectName, m.name as moduleName`;

    function processRows(rows) {
        return (rows || []).map(r => {
            mapStatus(r);
            r.moduleId  = r.module_id;
            r.projectId = r.project_id;
            r.releaseDate = (r.created_at || '').replace('T', ' ').substring(0, 19);
            r.fileSize  = r.file_size ? formatFileSize(r.file_size) : '-';
            r.fileName  = r.file_path ? path.basename(r.file_path) : '-';
            if (!r.name) r.name = (r.moduleName || '') + (r.version ? ' ' + r.version : '');
            return r;
        });
    }

    if (!paginated) {
        // 无分页参数：返回全量数组（供 Dashboard 等页面使用）
        db.all(`${selectCols} ${baseFrom} ORDER BY f.created_at DESC`, params, (err, rows) => {
            if (err) return res.status(500).json({ code: 500, message: '获取固件列表失败', data: null });
            res.json({ code: 200, message: '获取固件列表成功', data: processRows(rows) });
        });
    } else {
        // 有分页参数：返回 { list, total, page, pageSize, totalPages }
        db.get(`SELECT COUNT(*) as total ${baseFrom}`, params, (err, countRow) => {
            if (err) return res.status(500).json({ code: 500, message: '获取固件列表失败', data: null });
            const total      = countRow.total;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const offset     = (Math.min(page, totalPages) - 1) * pageSize;
            db.all(
                `${selectCols} ${baseFrom} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
                [...params, pageSize, offset],
                (err2, rows) => {
                    if (err2) return res.status(500).json({ code: 500, message: '获取固件列表失败', data: null });
                    res.json({ code: 200, message: '获取固件列表成功', data: {
                        list: processRows(rows), total, page: Math.min(page, totalPages), pageSize, totalPages
                    }});
                }
            );
        });
    }
});

// POST 新建固件 (带文件上传)
app.post('/api/firmware', requireRole('管理员', '开发者'), (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ code: 413, message: '文件大小超过服务器限制', data: null });
        }
        if (err) return next(err);
        next();
    });
}, (req, res) => {
    const { name, version, description, project_id, module_id, status, maxFileSize } = req.body;
    if (!version) return res.status(400).json({ code: 400, message: '固件版本不能为空', data: null });
    if (!FIRMWARE_VERSION_REGEX.test(String(version).trim())) {
        return res.status(400).json({ code: 400, message: '版本号格式不正确，应为 V主版本.次版本.修订版本（可选.构建号），例如: V1.0.0 或 V1.0.0.1', data: null });
    }
    if (!module_id) return res.status(400).json({ code: 400, message: '请选择模块', data: null });

    // 校验客户端传来的文件大小限制（字节）
    if (req.file && maxFileSize) {
        const limitBytes = parseInt(maxFileSize);
        if (!isNaN(limitBytes) && req.file.size > limitBytes) {
            fs.unlink(req.file.path, () => {});
            const limitMB = (limitBytes / 1024 / 1024).toFixed(0);
            logger.warn(`文件超出大小限制: ${req.file.size} bytes > ${limitBytes} bytes`);
            return res.status(413).json({ code: 413, message: `文件大小超过限制（最大 ${limitMB} MB）`, data: null });
        }
    }

    if (req.file) {
        logger.info(`文件上传: ${req.file.originalname}, 大小: ${req.file.size} bytes, 路径: ${req.file.path}`);
    } else {
        logger.debug('新建固件（无文件）version=' + version + ' module_id=' + module_id);
    }

    const filePath = req.file
        ? '/' + path.relative(path.join(__dirname, '..'), req.file.path).replace(/\\/g, '/')
        : null;
    const fileSize = req.file ? req.file.size : null;
    const dbStatus = toDbStatus(status);
    const firmwareName = name || '';

    let md5Hash = null;
    if (req.file && req.file.path) {
        try {
            const fileBuffer = fs.readFileSync(req.file.path);
            md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        } catch (e) {
            logger.warn('计算MD5失败:', e.message);
        }
    }

    db.run(
        `INSERT INTO firmwares (name, version, description, project_id, module_id, file_path, file_size, md5, status, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [firmwareName, version, description || '', project_id || null, module_id, filePath, fileSize, md5Hash, dbStatus, req.currentUser.userId],
        function(err) {
            if (err) return res.status(500).json({ code: 500, message: '创建固件失败: ' + err.message, data: null });
            db.get(
                `SELECT f.id, f.name, f.version, f.description, f.file_size, f.file_path, f.md5, f.status,
                        f.module_id, f.project_id, f.created_at,
                        p.name as projectName, m.name as moduleName
                 FROM firmwares f
                 LEFT JOIN projects p ON f.project_id = p.id
                 LEFT JOIN modules m ON f.module_id = m.id
                 WHERE f.id = ?`,
                [this.lastID],
                (err2, row) => {
                    if (row) {
                        mapStatus(row);
                        row.moduleId = row.module_id;
                        row.projectId = row.project_id;
                        row.releaseDate = (row.created_at || '').replace('T', ' ').substring(0, 19);
                        row.fileSize = row.file_size ? formatFileSize(row.file_size) : '-';
                        row.fileName  = row.file_path ? path.basename(row.file_path) : '-';
                        if (!row.name) row.name = (row.moduleName || '') + (row.version ? ' ' + row.version : '');
                    }
                    res.json({ code: 200, message: '创建固件成功', data: row });
                    // 写活动日志：上传固件
                    try {
                        insertActivity('upload', req.currentUser.userId, req.currentUser.username, row && row.id, row && row.name);
                    } catch(e) {}
                }
            );
        }
    );
});

// PUT 更新固件
app.put('/api/firmware/:id', requireRole('管理员', '开发者', '测试员'), (req, res) => {
    const role = req.currentUser.role;
    const { version, description, project_id, module_id, status } = req.body;
    const feStatus = status || 'pending';
    const dbStatus = toDbStatus(feStatus);

    if (version !== undefined && version !== null && !FIRMWARE_VERSION_REGEX.test(String(version).trim())) {
        return res.status(400).json({ code: 400, message: '版本号格式不正确，应为 V主版本.次版本.修订版本（可选.构建号），例如: V1.0.0 或 V1.0.0.1', data: null });
    }

    // 测试员：只允许修改状态，且仅限 pending ↔ tested
    if (role === '测试员') {
        const allowedStatuses = ['pending', 'tested'];
        if (!allowedStatuses.includes(feStatus)) {
            logger.warn(`测试员 "${req.currentUser.username}" 尝试将固件状态设为 "${feStatus}"，已拒绝`);
            return res.status(403).json({ code: 403, message: '测试员只能在"待测试"和"已测试"之间切换状态', data: null });
        }
        // 查当前状态，防止篡改已激活/已废弃的固件
        return db.get(`SELECT status FROM firmwares WHERE id = ?`, [req.params.id], (err, row) => {
            if (err || !row) return res.status(404).json({ code: 404, message: '固件不存在', data: null });
            const currentFe = DB_TO_FE[row.status] || row.status;
            if (!allowedStatuses.includes(currentFe)) {
                logger.warn(`测试员 "${req.currentUser.username}" 尝试修改状态为 "${currentFe}" 的固件，已拒绝`);
                return res.status(403).json({ code: 403, message: '当前固件状态不允许测试员修改', data: null });
            }
            db.run(
                `UPDATE firmwares SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [dbStatus, req.params.id],
                function(err2) {
                    if (err2) return res.status(500).json({ code: 500, message: '更新固件状态失败', data: null });
                    res.json({ code: 200, message: '更新固件成功', data: null });
                }
            );
        });
    }

    // 管理员 / 开发者：允许修改所有字段
    db.run(
        `UPDATE firmwares SET version = ?, description = ?, project_id = ?, module_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [version || '', description || '', project_id || null, module_id || null, dbStatus, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ code: 500, message: '更新固件失败', data: null });
            res.json({ code: 200, message: '更新固件成功', data: null });
            // 写活动日志：修改固件
            try {
                // 获取固件名
                db.get(`SELECT name FROM firmwares WHERE id = ?`, [req.params.id], (err2, r) => {
                    const fname = r && r.name;
                    insertActivity('modify', req.currentUser.userId, req.currentUser.username, req.params.id, fname);
                });
            } catch(e) {}
        }
    );
});

// DELETE 删除固件
app.delete('/api/firmware/:id', requireRole('管理员', '开发者'), (req, res) => {
    // 先查出文件路径，删除物理文件
    db.get(`SELECT file_path FROM firmwares WHERE id = ?`, [req.params.id], (err, row) => {
        if (row && row.file_path) {
            const fullPath = path.join(__dirname, '..', row.file_path);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
        db.run(`DELETE FROM firmwares WHERE id = ?`, [req.params.id], function(err2) {
            if (err2) return res.status(500).json({ code: 500, message: '删除固件失败', data: null });
            res.json({ code: 200, message: '删除固件成功', data: null });
            // 写活动日志：删除固件
            try {
                insertActivity('delete', req.currentUser.userId, req.currentUser.username, req.params.id, null);
            } catch(e) {}
        });
    });
});

// 固件文件下载
app.get('/api/firmware/:id/download', (req, res) => {
    db.get(`SELECT file_path, name, version FROM firmwares WHERE id = ?`, [req.params.id], (err, row) => {
        if (!row || !row.file_path) return res.status(404).json({ code: 404, message: '固件文件不存在', data: null });
        const fullPath = path.join(__dirname, '..', row.file_path);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ code: 404, message: '固件文件不存在', data: null });
        // 写活动日志：下载固件（记录后再下载）
        try {
            insertActivity('download', req.currentUser && req.currentUser.userId, req.currentUser && req.currentUser.username, req.params.id, row && (row.name || row.version));
        } catch(e) {}
        res.download(fullPath);
    });
});

// 文件大小格式化 (服务端使用)
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 错误处理中间件
app.use((err, req, res, next) => {
    logger.error(`未捕获异常 ${req.method} ${req.originalUrl}:`, err.message);
    if (err.stack) logger.error(err.stack);
    res.status(500).json({ code: 500, message: '服务器内部错误', data: null });
});

// 启动服务器
app.listen(PORT, () => {
    logger.info(`服务器启动成功，监听端口 ${PORT}`);
    logger.info(`访问地址: http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
    logger.warn('收到 SIGINT 信号，正在关闭服务器...');
    db.close((err) => {
        if (err) logger.error('关闭数据库错误:', err.message);
        else logger.info('数据库连接已关闭');
        process.exit(0);
    });
});

