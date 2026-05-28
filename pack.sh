#!/usr/bin/env bash
# pack.sh — 将 XFMS 打包为 .deb 包
# 用法：bash pack.sh
# 安装：sudo dpkg -i xfms_<version>_amd64.deb

set -euo pipefail

# ── 工具检查 ───────────────────────────────────────────
for cmd in dpkg-deb rsync node npm; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "✗ 缺少依赖命令：$cmd" >&2
        exit 1
    fi
done

# ── 配置 ───────────────────────────────────────────────
PKG_NAME="xfms"
VERSION=$(node -p "require('./package.json').version")
ARCH="amd64"
MAINTAINER="Aurson <jassimxiong@gmail.com>"

PKG_FULL="${PKG_NAME}_${VERSION}_${ARCH}"
STAGE_DIR="$(pwd)/.pkg_stage/${PKG_FULL}"
INSTALL_DIR="/opt/xfms"
SERVICE_SRC="$(pwd)/xfms.service"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  XFMS 打包工具  v${VERSION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 检查 service 文件 ──────────────────────────────────
if [ ! -f "$SERVICE_SRC" ]; then
    echo "✗ 未找到 xfms.service，请确认文件位于项目根目录" >&2
    exit 1
fi

# ── 清理并创建目录结构 ─────────────────────────────────
echo "[1/6] 清理旧构建 ..."
rm -rf .pkg_stage
mkdir -p "${STAGE_DIR}/DEBIAN"
mkdir -p "${STAGE_DIR}${INSTALL_DIR}/uploads"
mkdir -p "${STAGE_DIR}${INSTALL_DIR}/database"
mkdir -p "${STAGE_DIR}/usr/lib/systemd/system"

# ── 复制项目文件（排除不必要内容）───────────────────────
echo "[2/6] 复制项目文件 ..."
rsync -a \
    --exclude='.git/' \
    --exclude='.pkg_stage/' \
    --exclude='*.deb' \
    --exclude='pack.sh' \
    --exclude='xfms.service' \
    --exclude='node_modules/' \
    ./ "${STAGE_DIR}${INSTALL_DIR}/"

# ── 安装生产依赖（排除 devDependencies）────────────────
echo "[3/6] 安装生产依赖（npm ci --omit=dev）..."
cp package.json package-lock.json "${STAGE_DIR}${INSTALL_DIR}/"
(cd "${STAGE_DIR}${INSTALL_DIR}" && npm ci --omit=dev --silent)

# ── 复制 systemd 服务文件 ──────────────────────────────
echo "[4/6] 复制 systemd 服务文件 ..."
cp "$SERVICE_SRC" "${STAGE_DIR}/usr/lib/systemd/system/${PKG_NAME}.service"

# ── 生成 DEBIAN 控制文件 ───────────────────────────────
echo "[5/6] 生成 DEBIAN 控制文件 ..."

# control
cat > "${STAGE_DIR}/DEBIAN/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: ${MAINTAINER}
Depends: nodejs (>= 18)
Section: web
Priority: optional
Description: X Firmware Management System
 A web-based firmware management system for managing firmware versions,
 projects, modules, and users. Listens on port 3000 by default.
 .
 Service config: /usr/lib/systemd/system/xfms.service
 Install path:   /opt/xfms
 Data path:      /opt/xfms/database
 Uploads:        /opt/xfms/uploads
EOF

# postinst — 安装后脚本
cat > "${STAGE_DIR}/DEBIAN/postinst" << 'POSTINST'
#!/bin/bash
set -e

echo "→ 配置 XFMS ..."

# 创建专用系统用户（若不存在）
if ! id -u xfms > /dev/null 2>&1; then
    echo "  创建系统用户 xfms ..."
    useradd --system --no-create-home --shell /usr/sbin/nologin xfms
fi

# 确保目录存在并设置权限
mkdir -p /opt/xfms/uploads
mkdir -p /opt/xfms/database
chown -R xfms:xfms /opt/xfms
chmod 755 /opt/xfms
chmod 750 /opt/xfms/database
chmod 750 /opt/xfms/uploads

# 初始化数据库（仅首次，文件不存在时）
if [ ! -f /opt/xfms/database/xfms.db ]; then
    echo "  初始化数据库 ..."
    su -s /bin/sh xfms -c "cd /opt/xfms && node server/init-db.js" || {
        echo "  ⚠ 数据库初始化失败，请手动执行：cd /opt/xfms && node server/init-db.js"
    }
fi

# 加载 systemd 并启动服务
systemctl daemon-reload
systemctl enable xfms.service
systemctl start xfms.service || true

echo ""
echo "✓ XFMS 安装完成！"
echo "  访问地址  : http://localhost:3000"
echo "  服务状态  : systemctl status xfms"
echo "  查看日志  : journalctl -u xfms -f"
echo "  修改端口  : 编辑 /usr/lib/systemd/system/xfms.service 中的 PORT=3000"
POSTINST
chmod 755 "${STAGE_DIR}/DEBIAN/postinst"

# prerm — 卸载前脚本（停止并禁用服务）
cat > "${STAGE_DIR}/DEBIAN/prerm" << 'PRERM'
#!/bin/bash
set -e

if systemctl is-active --quiet xfms.service 2>/dev/null; then
    echo "→ 停止 xfms 服务 ..."
    systemctl stop xfms.service
fi

if systemctl is-enabled --quiet xfms.service 2>/dev/null; then
    echo "→ 禁用 xfms 服务 ..."
    systemctl disable xfms.service
fi
PRERM
chmod 755 "${STAGE_DIR}/DEBIAN/prerm"

# postrm — 卸载后脚本（purge 时清理数据和用户）
cat > "${STAGE_DIR}/DEBIAN/postrm" << 'POSTRM'
#!/bin/bash
set -e

systemctl daemon-reload || true

if [ "$1" = "purge" ]; then
    echo "→ 清理 XFMS 数据 ..."
    rm -rf /opt/xfms
    if id -u xfms > /dev/null 2>&1; then
        userdel xfms || true
    fi
    echo "  数据已清除（含数据库和上传文件）"
fi
POSTRM
chmod 755 "${STAGE_DIR}/DEBIAN/postrm"

# ── 修正文件权限 ───────────────────────────────────────
find "${STAGE_DIR}" -not -path "${STAGE_DIR}/DEBIAN/*" -type d -exec chmod 755 {} \;
find "${STAGE_DIR}" -not -path "${STAGE_DIR}/DEBIAN/*" -type f -exec chmod 644 {} \;
# 重新确保 DEBIAN 脚本可执行
chmod 755 "${STAGE_DIR}/DEBIAN/postinst" \
          "${STAGE_DIR}/DEBIAN/prerm"    \
          "${STAGE_DIR}/DEBIAN/postrm"

# ── 构建 .deb ─────────────────────────────────────────
echo "[6/6] 构建 .deb 包 ..."
dpkg-deb --build --root-owner-group "${STAGE_DIR}" "${PKG_FULL}.deb"

# ── 清理临时目录 ───────────────────────────────────────
rm -rf .pkg_stage

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ 打包完成：${PKG_FULL}.deb"
echo ""
echo "  安装命令："
echo "    sudo dpkg -i ${PKG_FULL}.deb"
echo ""
echo "  卸载命令（保留数据）："
echo "    sudo dpkg -r xfms"
echo ""
echo "  彻底卸载（清除数据）："
echo "    sudo dpkg -P xfms"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
