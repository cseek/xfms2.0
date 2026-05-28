/*
 *        ___ ___ _________ ___  ___ 
 *       / _ `/ // / __(_-</ _ \/ _ \
 *       \_,_/\_,_/_/ /___/\___/_//_/
 * 
 * @Author: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @Date: 2026-01-24 15:30:39
 * @LastEditors: 熊昱卿(Aurson) jassimxiong@gmail.com
 * @LastEditTime: 2026-04-10 01:29:55
 * @Description: Dashboard 页面脚本，负责加载和展示系统统计数据、活动日志等信息，提供数据可视化图表，并监听语言切换事件以动态更新文本内容
 * Copyright (c) 2026 by Aurson, All Rights Reserved. 
 */
(function() {
    'use strict';
    
    let currentLang = localStorage.getItem('firmwareLang') || 'zh';
    let _loginCount = 0;

    // 每个状态对应的颜色列表（模块切片用）
    const SLICE_COLORS = [
        '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
        '#06b6d4','#f97316','#84cc16','#ec4899','#6366f1',
    ];

    async function init() {
        applyLanguage(currentLang);
        const [, statsData] = await Promise.all([
            DataManager.loadData(),
            API.settings.get().catch(() => ({}))
        ]);
        _loginCount = parseInt((statsData || {}).loginCount) || 0;
        updateStats();
        renderCharts();
        loadActivityLogs();
    }

    function updateStats() {
        document.getElementById('projectsCount').textContent = projects.length;
        document.getElementById('modulesCount').textContent = modules.length;
        document.getElementById('firmwareCount').textContent = firmware.length;
        document.getElementById('activeFirmwareCount').textContent =
            firmware.filter(f => f.status === 'activated').length;
        document.getElementById('usersCount').textContent = users.length;
        document.getElementById('loginCount').textContent = _loginCount;
    }

    /**
     * 按模块占比绘制甜甜圈饼图
     * @param {string} canvasId
     * @param {string} legendId
     * @param {{ name:string, count:number }[]} slices  各模块数量
     */
    function drawPieChart(canvasId, legendId, slices) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const r     = Math.min(W, H) * 0.28;
        const holeR = r * 0.50;

        const cardBg      = getComputedStyle(document.documentElement).getPropertyValue('--card-color').trim()    || '#ffffff';
        const textPriColor= getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim()  || '#111827';
        const textSecColor= getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim()|| '#6b7280';

        ctx.clearRect(0, 0, W, H);
        const total = slices.reduce((s, d) => s + d.count, 0);

        if (total === 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.fillStyle = '#e5e7eb';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, holeR, 0, 2 * Math.PI);
            ctx.fillStyle = cardBg;
            ctx.fill();
            ctx.fillStyle = textSecColor;
            ctx.font = '0.8rem sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('暂无数据', cx, cy);
            const legend = document.getElementById(legendId);
            if (legend) legend.innerHTML = '';
            return;
        }

        // 1. 绘制各扇形
        let startAngle = -Math.PI / 2;
        slices.forEach((d, i) => {
            const sweep = (d.count / total) * 2 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
            ctx.closePath();
            ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
            ctx.fill();
            startAngle += sweep;
        });

        // 2. 中心镂空
        ctx.beginPath();
        ctx.arc(cx, cy, holeR, 0, 2 * Math.PI);
        ctx.fillStyle = cardBg;
        ctx.fill();

        // 3. 中心文字
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = textPriColor;
        ctx.font = 'bold 1.4rem sans-serif';
        ctx.fillText(total, cx, cy - 8);
        ctx.fillStyle = textSecColor;
        ctx.font = '0.7rem sans-serif';
        ctx.fillText('C', cx, cy + 12);

        // 4. 引导线 + 标签（第二遍，绘制在最上层）
        const lineStart = r + 5;
        const lineLen   = 20;
        const tickLen   = 20;
        const fs        = 11;

        startAngle = -Math.PI / 2;
        slices.forEach((d, i) => {
            const sweep    = (d.count / total) * 2 * Math.PI;
            const midAngle = startAngle + sweep / 2;
            const color    = SLICE_COLORS[i % SLICE_COLORS.length];

            // 斜线起止点
            const x1 = cx + lineStart * Math.cos(midAngle);
            const y1 = cy + lineStart * Math.sin(midAngle);
            const x2 = cx + (lineStart + lineLen) * Math.cos(midAngle);
            const y2 = cy + (lineStart + lineLen) * Math.sin(midAngle);

            // 水平折线方向
            const goRight = Math.cos(midAngle) >= 0;
            const x3 = x2 + (goRight ? tickLen : -tickLen);
            const y3 = y2;

            // 折线
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 末端小圆点
            ctx.beginPath();
            ctx.arc(x3, y3, 2.5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // 标签文字
            const label = d.name.length > 7 ? d.name.slice(0, 7) + '…' : d.name;
            const pct   = Math.round((d.count / total) * 100);
            const tx    = x3 + (goRight ? 5 : -5);

            ctx.textBaseline = 'middle';
            ctx.textAlign    = goRight ? 'left' : 'right';
            ctx.font         = `bold ${fs}px sans-serif`;
            ctx.fillStyle    = textPriColor;
            ctx.fillText(label, tx, y3 - 7);
            ctx.font         = `${fs - 1}px sans-serif`;
            ctx.fillStyle    = textSecColor;
            ctx.fillText(`${d.count}c · ${pct}%`, tx, y3 + 7);

            startAngle += sweep;
        });

        const legend = document.getElementById(legendId);
        if (legend) legend.innerHTML = '';
    }

    function renderCharts() {
        const statuses = ['pending', 'tested', 'activated', 'deprecated'];
        const canvasIds = ['chartPending', 'chartTested', 'chartActivated', 'chartDeprecated'];
        const legendIds = ['legendPending', 'legendTested', 'legendActivated', 'legendDeprecated'];

        statuses.forEach((status, idx) => {
            // 统计该状态下各模块的固件数量
            const countMap = {};
            firmware.filter(f => f.status === status).forEach(f => {
                const name = f.moduleName || '未知模块';
                countMap[name] = (countMap[name] || 0) + 1;
            });
            const slices = Object.entries(countMap)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);
            drawPieChart(canvasIds[idx], legendIds[idx], slices);
        });
    }

    async function loadActivityLogs() {
        try {
            const rows = await API.activity.recent(20);
            const container = document.getElementById('activityList');
            const trans = translations[currentLang] || {};
            const actionMap = {
                upload: trans.activityUpload || (currentLang==='en'?'Upload':'上传'),
                download: trans.activityDownload || (currentLang==='en'?'Download':'下载'),
                modify: trans.activityModify || (currentLang==='en'?'Modify':'修改'),
                delete: trans.activityDelete || (currentLang==='en'?'Delete':'删除')
            };
            if (!container) return;
            container.innerHTML = '';
                (rows || []).forEach(r => {
                    const time = new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ');
                    const actor = r.actor_name || '-';
                    const action = actionMap[r.action] || r.action;
                    const parts = [];
                    if (r.project_name) parts.push(r.project_name);
                    if (r.module_name) parts.push(r.module_name);
                    if (r.version) parts.push(r.version);
                    const target = parts.join(' / ') || (r.firmware_name || '-');

                    const rowElem = document.createElement('div');
                    rowElem.className = 'activity-row';
                    rowElem.textContent = `${time}: ${action} → ${target}${actor ? ' (' + actor + ')' : ''}`;

                    container.appendChild(rowElem);
            });
        } catch (e) {
            // ignore
        }
    }

    window.addEventListener('message', (event) => {
        if (event.data.type === 'languageChange') {
            currentLang = event.data.lang;
            applyLanguage(currentLang);
            // reload activity log translations
            loadActivityLogs();
        }
    });

    document.addEventListener('DOMContentLoaded', init);
    // 定期刷新活动日志
    setInterval(() => { try { loadActivityLogs(); } catch(e) {} }, 30000);
})();