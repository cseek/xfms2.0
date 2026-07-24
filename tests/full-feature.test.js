/*
 * Full API integration tests for XFMS.
 *
 * The suite starts an isolated server process with a temporary SQLite database
 * and upload directory. It covers authentication, route access, settings,
 * CRUD flows, role permissions, validation failures, pagination/search/filter,
 * firmware upload/download, activity logs, and dependency delete guards.
 */
const assert = require('assert');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const ROLES = {
    admin: '管理员',
    developer: '开发者',
    tester: '测试员',
    user: '普通用户'
};

const roleUsers = {
    admin: { username: 'admin', password: 'admin' },
    developer: { username: 'matrix_developer', password: 'pass_developer', role: ROLES.developer },
    tester: { username: 'matrix_tester', password: 'pass_tester', role: ROLES.tester },
    user: { username: 'matrix_user', password: 'pass_user', role: ROLES.user }
};

const permissionMatrix = {
    settings: {
        read:   { allowed: ['admin', 'developer', 'tester', 'user'] },
        update: { allowed: ['admin'] }
    },
    project: {
        read:   { allowed: ['admin', 'developer', 'tester', 'user'] },
        create: { allowed: ['admin'] },
        update: { allowed: ['admin'] },
        delete: { allowed: ['admin'] }
    },
    module: {
        read:   { allowed: ['admin', 'developer', 'tester', 'user'] },
        create: { allowed: ['admin'] },
        update: { allowed: ['admin'] },
        delete: { allowed: ['admin'] }
    },
    firmware: {
        read:     { allowed: ['admin', 'developer', 'tester', 'user'] },
        create:   { allowed: ['admin', 'developer'] },
        update:   { allowed: ['admin', 'developer', 'tester'] },
        delete:   { allowed: ['admin', 'developer'] },
        download: { allowed: ['admin', 'developer', 'tester', 'user'] }
    },
    user: {
        read:   { allowed: ['admin', 'developer', 'tester', 'user'] },
        create: { allowed: ['admin'] },
        update: { allowed: ['admin'], selfAllowed: ['developer', 'tester', 'user'] },
        delete: { allowed: ['admin'] }
    },
    activity: {
        read: { allowed: ['admin', 'developer', 'tester', 'user'] }
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function request(baseUrl, method, url, token, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    const init = {
        method,
        headers,
        redirect: options.redirect || 'follow'
    };

    if (token) headers.Authorization = `Bearer ${token}`;
    if (body instanceof FormData) {
        init.body = body;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }

    const res = await fetch(baseUrl + url, init);
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (e) {
        json = { raw: text };
    }

    return {
        status: res.status,
        headers: res.headers,
        body: json,
        text
    };
}

async function download(baseUrl, url, token) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(baseUrl + url, { headers });
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, buffer };
}

async function waitForServer(baseUrl, child) {
    for (let i = 0; i < 80; i += 1) {
        if (child.exitCode !== null) {
            throw new Error(`server exited early with code ${child.exitCode}`);
        }
        try {
            const page = await fetch(baseUrl + '/login.html');
            if (page.ok) {
                // The HTTP listener can be ready before asynchronous database seeding.
                // Probe the seeded admin account so the first auth test is deterministic.
                const auth = await request(baseUrl, 'POST', '/api/login', null, {
                    username: roleUsers.admin.username,
                    password: roleUsers.admin.password
                });
                if (auth.status === 200) {
                    await request(baseUrl, 'POST', '/api/logout', auth.body.data.token);
                    return;
                }
            }
        } catch (e) {
            // keep polling
        }
        await delay(100);
    }
    throw new Error('server did not become ready');
}

async function login(baseUrl, username, password) {
    let res = null;
    for (let i = 0; i < 30; i += 1) {
        res = await request(baseUrl, 'POST', '/api/login', null, { username, password });
        if (res.status === 200) break;
        await delay(100);
    }
    assert.strictEqual(res.status, 200, `login failed for ${username}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.token, `missing token for ${username}`);
    return res.body.data;
}

async function seedUsers(baseUrl, adminToken) {
    for (const key of ['developer', 'tester', 'user']) {
        const user = roleUsers[key];
        const res = await request(baseUrl, 'POST', '/api/user', adminToken, {
            username: user.username,
            password: user.password,
            role: user.role,
            email: `${user.username}@example.test`,
            bio: `${user.role} test account`
        });
        assert.strictEqual(res.status, 200, `seed ${key} failed: ${JSON.stringify(res.body)}`);
    }
}

async function seedProjectModule(baseUrl, adminToken, suffix) {
    const project = await request(baseUrl, 'POST', '/api/project', adminToken, {
        name: `matrix-project-${suffix}`,
        description: 'permission matrix project'
    });
    assert.strictEqual(project.status, 200, `seed project failed: ${JSON.stringify(project.body)}`);

    const module = await request(baseUrl, 'POST', '/api/module', adminToken, {
        name: `matrix-module-${suffix}`,
        description: 'permission matrix module',
        project_id: project.body.data.id
    });
    assert.strictEqual(module.status, 200, `seed module failed: ${JSON.stringify(module.body)}`);

    return { project: project.body.data, module: module.body.data };
}

async function createFirmware(baseUrl, token, projectId, moduleId, suffix, overrides = {}) {
    const fileContent = overrides.fileContent || `firmware-${suffix}`;
    const form = new FormData();

    if (overrides.name !== null) form.set('name', overrides.name || `matrix-firmware-${suffix}`);
    if (overrides.version !== null) form.set('version', overrides.version || `1.0.${suffix}`);
    form.set('description', overrides.description || 'permission matrix firmware');
    if (overrides.projectId !== null) form.set('project_id', String(overrides.projectId || projectId));
    if (overrides.moduleId !== null) form.set('module_id', String(overrides.moduleId || moduleId));
    form.set('status', overrides.status || 'pending');
    form.set('maxFileSize', String(overrides.maxFileSize || 1024 * 1024));
    if (overrides.withFile !== false) {
        form.set(
            'file',
            new Blob([fileContent], { type: 'application/octet-stream' }),
            overrides.fileName || `firmware-${suffix}.bin`
        );
    }

    return request(baseUrl, 'POST', '/api/firmware', token, form);
}

function expectAllowed(roleKey, resource, action, mode = 'normal') {
    const rule = permissionMatrix[resource][action];
    if (rule.allowed.includes(roleKey)) return true;
    return mode === 'self' && rule.selfAllowed && rule.selfAllowed.includes(roleKey);
}

function assertPermission(result, expectedAllowed, label) {
    if (expectedAllowed) {
        assert.strictEqual(result.status, 200, `${label} should be allowed, got ${result.status}: ${JSON.stringify(result.body)}`);
    } else {
        assert.strictEqual(result.status, 403, `${label} should be forbidden, got ${result.status}: ${JSON.stringify(result.body)}`);
    }
}

function filePathFromApiPath(apiPath) {
    return path.join(REPO_ROOT, apiPath);
}

async function waitForActivity(baseUrl, token, predicate, label) {
    for (let i = 0; i < 30; i += 1) {
        const logs = await request(baseUrl, 'GET', '/api/activity-logs?limit=100', token);
        assert.strictEqual(logs.status, 200);
        if (logs.body.data.some(predicate)) return logs.body.data;
        await delay(100);
    }
    assert.fail(`activity log not found: ${label}`);
}

async function runStep(name, fn) {
    await fn();
    console.log(`PASS ${name}`);
}

async function runAuthAndRouteTests(baseUrl) {
    const missingLogin = await request(baseUrl, 'POST', '/api/login', null, { username: '', password: '' });
    assert.strictEqual(missingLogin.status, 400);

    const badLogin = await request(baseUrl, 'POST', '/api/login', null, { username: 'admin', password: 'wrong' });
    assert.strictEqual(badLogin.status, 401);

    const unauthSettings = await request(baseUrl, 'GET', '/api/settings', null);
    assert.strictEqual(unauthSettings.status, 401);

    const routeRedirect = await request(baseUrl, 'GET', '/pages/dashboard.html', null, undefined, { redirect: 'manual' });
    assert.strictEqual(routeRedirect.status, 302);
    assert.strictEqual(routeRedirect.headers.get('location'), '/index.html#dashboard');

    const routeTemplate = await request(baseUrl, 'GET', '/pages/dashboard.html', null, undefined, {
        headers: { 'X-Route-Template': '1' }
    });
    assert.strictEqual(routeTemplate.status, 200);
    assert.ok(routeTemplate.text.includes('page-content'));

    const index = await request(baseUrl, 'GET', '/index', null);
    assert.strictEqual(index.status, 200);
    assert.ok(index.text.includes('routeView'));

    const admin = await login(baseUrl, 'admin', 'admin');
    const authedSettings = await request(baseUrl, 'GET', '/api/settings', admin.token);
    assert.strictEqual(authedSettings.status, 200);

    const logout = await request(baseUrl, 'POST', '/api/logout', admin.token);
    assert.strictEqual(logout.status, 200);

    const expired = await request(baseUrl, 'GET', '/api/settings', admin.token);
    assert.strictEqual(expired.status, 401);
}

async function runSettingsTests(baseUrl, tokens) {
    for (const roleKey of Object.keys(roleUsers)) {
        assertPermission(
            await request(baseUrl, 'GET', '/api/settings', tokens[roleKey]),
            expectAllowed(roleKey, 'settings', 'read'),
            `${roleKey} settings read`
        );

        const update = await request(baseUrl, 'PUT', '/api/settings', tokens[roleKey], {
            defaultLanguage: roleKey === 'admin' ? 'en' : 'zh',
            maxFileSize: 64
        });
        assertPermission(update, expectAllowed(roleKey, 'settings', 'update'), `${roleKey} settings update`);
    }

    const settings = await request(baseUrl, 'GET', '/api/settings', tokens.admin);
    assert.strictEqual(settings.status, 200);
    assert.strictEqual(settings.body.data.defaultLanguage, 'en');
    assert.strictEqual(settings.body.data.maxFileSize, '64');

    const emptyUpdate = await request(baseUrl, 'PUT', '/api/settings', tokens.admin, {});
    assert.strictEqual(emptyUpdate.status, 400);
}

async function runCrudPermissionMatrix(baseUrl, tokens, seeded) {
    const adminToken = tokens.admin;
    let suffix = 10;

    for (const roleKey of Object.keys(roleUsers)) {
        const token = tokens[roleKey];

        assertPermission(
            await request(baseUrl, 'GET', '/api/project', token),
            expectAllowed(roleKey, 'project', 'read'),
            `${roleKey} project read`
        );
        assertPermission(
            await request(baseUrl, 'GET', '/api/module', token),
            expectAllowed(roleKey, 'module', 'read'),
            `${roleKey} module read`
        );
        assertPermission(
            await request(baseUrl, 'GET', '/api/firmware', token),
            expectAllowed(roleKey, 'firmware', 'read'),
            `${roleKey} firmware read`
        );
        assertPermission(
            await request(baseUrl, 'GET', '/api/user', token),
            expectAllowed(roleKey, 'user', 'read'),
            `${roleKey} user read`
        );
        assertPermission(
            await request(baseUrl, 'GET', '/api/activity-logs', token),
            expectAllowed(roleKey, 'activity', 'read'),
            `${roleKey} activity read`
        );

        const projectCreate = await request(baseUrl, 'POST', '/api/project', token, {
            name: `matrix-project-create-${roleKey}`,
            description: `${roleKey} create`
        });
        assertPermission(projectCreate, expectAllowed(roleKey, 'project', 'create'), `${roleKey} project create`);
        const projectForRole = projectCreate.status === 200 ? projectCreate.body.data : seeded.project;

        const projectUpdate = await request(baseUrl, 'PUT', `/api/project/${seeded.project.id}`, token, {
            name: `matrix-project-updated-${roleKey}`,
            description: `${roleKey} update`
        });
        assertPermission(projectUpdate, expectAllowed(roleKey, 'project', 'update'), `${roleKey} project update`);

        const disposableProject = await request(baseUrl, 'POST', '/api/project', adminToken, {
            name: `matrix-project-delete-${roleKey}`,
            description: 'delete target'
        });
        assert.strictEqual(disposableProject.status, 200);
        assertPermission(
            await request(baseUrl, 'DELETE', `/api/project/${disposableProject.body.data.id}`, token),
            expectAllowed(roleKey, 'project', 'delete'),
            `${roleKey} project delete`
        );

        const moduleCreate = await request(baseUrl, 'POST', '/api/module', token, {
            name: `matrix-module-create-${roleKey}`,
            description: `${roleKey} create`,
            project_id: projectForRole.id
        });
        assertPermission(moduleCreate, expectAllowed(roleKey, 'module', 'create'), `${roleKey} module create`);

        const moduleUpdate = await request(baseUrl, 'PUT', `/api/module/${seeded.module.id}`, token, {
            name: `matrix-module-updated-${roleKey}`,
            description: `${roleKey} update`
        });
        assertPermission(moduleUpdate, expectAllowed(roleKey, 'module', 'update'), `${roleKey} module update`);

        const disposableModule = await request(baseUrl, 'POST', '/api/module', adminToken, {
            name: `matrix-module-delete-${roleKey}`,
            description: 'delete target',
            project_id: seeded.project.id
        });
        assert.strictEqual(disposableModule.status, 200);
        assertPermission(
            await request(baseUrl, 'DELETE', `/api/module/${disposableModule.body.data.id}`, token),
            expectAllowed(roleKey, 'module', 'delete'),
            `${roleKey} module delete`
        );

        const firmwareCreate = await createFirmware(baseUrl, token, seeded.project.id, seeded.module.id, suffix++);
        assertPermission(firmwareCreate, expectAllowed(roleKey, 'firmware', 'create'), `${roleKey} firmware create`);

        const updateFirmware = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, suffix++);
        assert.strictEqual(updateFirmware.status, 200);
        const firmwareUpdate = await request(baseUrl, 'PUT', `/api/firmware/${updateFirmware.body.data.id}`, token, {
            version: `2.0.${suffix++}`,
            description: `${roleKey} update`,
            project_id: seeded.project.id,
            module_id: seeded.module.id,
            status: 'tested'
        });
        assertPermission(firmwareUpdate, expectAllowed(roleKey, 'firmware', 'update'), `${roleKey} firmware update`);

        const deleteFirmware = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, suffix++);
        assert.strictEqual(deleteFirmware.status, 200);
        assertPermission(
            await request(baseUrl, 'DELETE', `/api/firmware/${deleteFirmware.body.data.id}`, token),
            expectAllowed(roleKey, 'firmware', 'delete'),
            `${roleKey} firmware delete`
        );

        const downloadFirmware = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, suffix++, {
            fileContent: `download-${roleKey}`
        });
        assert.strictEqual(downloadFirmware.status, 200);
        assertPermission(
            await download(baseUrl, `/api/firmware/${downloadFirmware.body.data.id}/download`, token),
            expectAllowed(roleKey, 'firmware', 'download'),
            `${roleKey} firmware download`
        );

        const userCreate = await request(baseUrl, 'POST', '/api/user', token, {
            username: `matrix-created-${roleKey}`,
            password: 'created-password',
            role: ROLES.user,
            email: `matrix-created-${roleKey}@example.test`
        });
        assertPermission(userCreate, expectAllowed(roleKey, 'user', 'create'), `${roleKey} user create`);

        const updateTarget = roleKey === 'admin' ? roleUsers.tester.data.id : roleUsers[roleKey].data.id;
        const userUpdate = await request(baseUrl, 'PUT', `/api/user/${updateTarget}`, token, roleKey === 'admin'
            ? {
                username: roleUsers.tester.username,
                password: roleUsers.tester.password,
                role: ROLES.tester,
                email: `${roleUsers.tester.username}@example.test`,
                bio: `admin-updated-${roleKey}`
            }
            : { password: `self-password-${roleKey}` });
        const updateMode = roleKey === 'admin' ? 'normal' : 'self';
        assertPermission(userUpdate, expectAllowed(roleKey, 'user', 'update', updateMode), `${roleKey} user update`);

        const otherUserUpdate = await request(baseUrl, 'PUT', `/api/user/${roleUsers.admin.data.id}`, token, { password: 'nope' });
        if (roleKey !== 'admin') {
            assert.strictEqual(otherUserUpdate.status, 403, `${roleKey} must not update another user`);
        }

        const disposableUser = await request(baseUrl, 'POST', '/api/user', adminToken, {
            username: `matrix-delete-${roleKey}`,
            password: 'delete-password',
            role: ROLES.user,
            email: `matrix-delete-${roleKey}@example.test`
        });
        assert.strictEqual(disposableUser.status, 200);
        assertPermission(
            await request(baseUrl, 'DELETE', `/api/user/${disposableUser.body.data.id}`, token),
            expectAllowed(roleKey, 'user', 'delete'),
            `${roleKey} user delete`
        );
    }
}

async function runValidationAndDependencyTests(baseUrl, tokens, seeded) {
    const adminToken = tokens.admin;

    const missingProjectName = await request(baseUrl, 'POST', '/api/project', adminToken, { description: 'missing name' });
    assert.strictEqual(missingProjectName.status, 400);

    const duplicateProject = await request(baseUrl, 'POST', '/api/project', adminToken, {
        name: 'matrix-project-updated-admin',
        description: 'duplicate'
    });
    assert.strictEqual(duplicateProject.status, 409);

    const projectWithModuleDelete = await request(baseUrl, 'DELETE', `/api/project/${seeded.project.id}`, adminToken);
    assert.strictEqual(projectWithModuleDelete.status, 400);

    const missingModuleName = await request(baseUrl, 'POST', '/api/module', adminToken, {
        description: 'missing name',
        project_id: seeded.project.id
    });
    assert.strictEqual(missingModuleName.status, 400);

    const duplicateModule = await request(baseUrl, 'POST', '/api/module', adminToken, {
        name: 'matrix-module-updated-admin',
        description: 'duplicate',
        project_id: seeded.project.id
    });
    assert.strictEqual(duplicateModule.status, 409);

    const protectedFirmware = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, 80);
    assert.strictEqual(protectedFirmware.status, 200);
    const moduleWithFirmwareDelete = await request(baseUrl, 'DELETE', `/api/module/${seeded.module.id}`, adminToken);
    assert.strictEqual(moduleWithFirmwareDelete.status, 400);

    const missingUserFields = await request(baseUrl, 'POST', '/api/user', adminToken, {
        username: 'missing-email'
    });
    assert.strictEqual(missingUserFields.status, 400);

    const duplicateUser = await request(baseUrl, 'POST', '/api/user', adminToken, {
        username: roleUsers.user.username,
        password: 'duplicate',
        role: ROLES.user,
        email: 'duplicate@example.test'
    });
    assert.strictEqual(duplicateUser.status, 400);

    const selfWithoutPassword = await request(baseUrl, 'PUT', `/api/user/${roleUsers.user.data.id}`, tokens.user, {});
    assert.strictEqual(selfWithoutPassword.status, 400);

    const missingVersion = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, 81, {
        version: null
    });
    assert.strictEqual(missingVersion.status, 400);

    const invalidVersion = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, 82, {
        version: '1.0'
    });
    assert.strictEqual(invalidVersion.status, 400);

    const prefixedVersion = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, 820, {
        version: 'V1.0.1'
    });
    assert.strictEqual(prefixedVersion.status, 400);

    const missingModule = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, 83, {
        moduleId: null
    });
    assert.strictEqual(missingModule.status, 400);

    const oversized = await createFirmware(baseUrl, adminToken, seeded.project.id, seeded.module.id, 84, {
        maxFileSize: 1,
        fileContent: 'too-large'
    });
    assert.strictEqual(oversized.status, 413);

    const invalidUpdateVersion = await request(baseUrl, 'PUT', `/api/firmware/${protectedFirmware.body.data.id}`, adminToken, {
        version: 'bad-version',
        description: 'invalid',
        project_id: seeded.project.id,
        module_id: seeded.module.id,
        status: 'pending'
    });
    assert.strictEqual(invalidUpdateVersion.status, 400);
}

async function runPaginationSearchFilterTests(baseUrl, tokens, seeded) {
    const adminToken = tokens.admin;
    const unique = 'needle-feature';

    const searchedProject = await request(baseUrl, 'POST', '/api/project', adminToken, {
        name: `project-${unique}`,
        description: 'pagination search project'
    });
    assert.strictEqual(searchedProject.status, 200);

    const searchedModule = await request(baseUrl, 'POST', '/api/module', adminToken, {
        name: `module-${unique}`,
        description: 'pagination search module',
        project_id: searchedProject.body.data.id
    });
    assert.strictEqual(searchedModule.status, 200);

    const searchedFirmware = await createFirmware(
        baseUrl,
        adminToken,
        searchedProject.body.data.id,
        searchedModule.body.data.id,
        85,
        {
            name: `firmware-${unique}`,
            description: `firmware ${unique}`,
            status: 'tested'
        }
    );
    assert.strictEqual(searchedFirmware.status, 200);

    const projects = await request(baseUrl, 'GET', `/api/project?page=1&pageSize=1&keyword=${unique}`, tokens.user);
    assert.strictEqual(projects.status, 200);
    assert.strictEqual(projects.body.data.pageSize, 1);
    assert.strictEqual(projects.body.data.total, 1);
    assert.strictEqual(projects.body.data.list[0].name, `project-${unique}`);

    const modules = await request(baseUrl, 'GET', `/api/module?page=1&pageSize=1&keyword=${unique}`, tokens.user);
    assert.strictEqual(modules.status, 200);
    assert.strictEqual(modules.body.data.total, 1);
    assert.strictEqual(modules.body.data.list[0].name, `module-${unique}`);

    const users = await request(baseUrl, 'GET', '/api/user?page=1&pageSize=1&keyword=matrix_user', tokens.user);
    assert.strictEqual(users.status, 200);
    assert.strictEqual(users.body.data.total, 1);
    assert.strictEqual(users.body.data.list[0].username, roleUsers.user.username);

    const firmwareByKeyword = await request(baseUrl, 'GET', `/api/firmware?page=1&pageSize=1&keyword=${unique}`, tokens.user);
    assert.strictEqual(firmwareByKeyword.status, 200);
    assert.strictEqual(firmwareByKeyword.body.data.total, 1);
    assert.strictEqual(firmwareByKeyword.body.data.list[0].status, 'tested');
    assert.strictEqual(firmwareByKeyword.body.data.list[0].projectId, searchedProject.body.data.id);
    assert.strictEqual(firmwareByKeyword.body.data.list[0].moduleId, searchedModule.body.data.id);

    const firmwareByFilters = await request(
        baseUrl,
        'GET',
        `/api/firmware?page=1&pageSize=5&projectId=${searchedProject.body.data.id}&moduleId=${searchedModule.body.data.id}&status=tested`,
        tokens.user
    );
    assert.strictEqual(firmwareByFilters.status, 200);
    assert.strictEqual(firmwareByFilters.body.data.total, 1);
    assert.strictEqual(firmwareByFilters.body.data.list[0].id, searchedFirmware.body.data.id);

    const fullProjectList = await request(baseUrl, 'GET', '/api/project', tokens.user);
    assert.strictEqual(fullProjectList.status, 200);
    assert.ok(Array.isArray(fullProjectList.body.data));
    assert.ok(fullProjectList.body.data.length >= 1);

    assert.ok(seeded.project.id);
}

async function runFirmwareFileAndActivityTests(baseUrl, tokens, seeded) {
    const fileContent = 'downloadable-firmware-content';
    const expectedMd5 = crypto.createHash('md5').update(fileContent).digest('hex');

    const firmware = await createFirmware(baseUrl, tokens.admin, seeded.project.id, seeded.module.id, 86, {
        fileContent,
        fileName: 'downloadable.bin'
    });
    assert.strictEqual(firmware.status, 200);
    assert.strictEqual(firmware.body.data.md5, expectedMd5);
    assert.strictEqual(firmware.body.data.fileName, 'downloadable.bin');
    assert.ok(firmware.body.data.file_path);

    const uploadedPath = filePathFromApiPath(firmware.body.data.file_path);
    assert.ok(fs.existsSync(uploadedPath), `uploaded file missing at ${uploadedPath}`);

    await waitForActivity(
        baseUrl,
        tokens.admin,
        row => row.action === 'upload' && row.firmware_id === firmware.body.data.id,
        'upload'
    );

    const noAuthDownload = await download(baseUrl, `/api/firmware/${firmware.body.data.id}/download`, null);
    assert.strictEqual(noAuthDownload.status, 401);

    const downloaded = await download(baseUrl, `/api/firmware/${firmware.body.data.id}/download`, tokens.user);
    assert.strictEqual(downloaded.status, 200);
    assert.strictEqual(downloaded.buffer.toString(), fileContent);

    await waitForActivity(
        baseUrl,
        tokens.user,
        row => row.action === 'download' && row.firmware_id === firmware.body.data.id,
        'download'
    );

    const update = await request(baseUrl, 'PUT', `/api/firmware/${firmware.body.data.id}`, tokens.developer, {
        version: '3.0.0',
        description: 'developer update for activity log',
        project_id: seeded.project.id,
        module_id: seeded.module.id,
        status: 'tested'
    });
    assert.strictEqual(update.status, 200);

    await waitForActivity(
        baseUrl,
        tokens.developer,
        row => row.action === 'modify' && Number(row.firmware_id) === firmware.body.data.id,
        'modify'
    );

    const deleteResult = await request(baseUrl, 'DELETE', `/api/firmware/${firmware.body.data.id}`, tokens.developer);
    assert.strictEqual(deleteResult.status, 200);
    assert.strictEqual(fs.existsSync(uploadedPath), false, 'firmware file should be deleted with record');

    await waitForActivity(
        baseUrl,
        tokens.developer,
        row => row.action === 'delete' && Number(row.firmware_id) === firmware.body.data.id,
        'delete'
    );

    const noFileFirmware = await createFirmware(baseUrl, tokens.admin, seeded.project.id, seeded.module.id, 87, {
        withFile: false
    });
    assert.strictEqual(noFileFirmware.status, 200);
    const noFileDownload = await download(baseUrl, `/api/firmware/${noFileFirmware.body.data.id}/download`, tokens.admin);
    assert.strictEqual(noFileDownload.status, 404);
}

async function runTesterFirmwareRestrictions(baseUrl, tokens, seeded) {
    const pendingFirmware = await createFirmware(baseUrl, tokens.admin, seeded.project.id, seeded.module.id, 90);
    assert.strictEqual(pendingFirmware.status, 200);

    const testerPendingToTested = await request(baseUrl, 'PUT', `/api/firmware/${pendingFirmware.body.data.id}`, tokens.tester, {
        status: 'tested'
    });
    assert.strictEqual(testerPendingToTested.status, 200, 'tester should switch pending firmware to tested');

    const testedToActivated = await request(baseUrl, 'PUT', `/api/firmware/${pendingFirmware.body.data.id}`, tokens.tester, {
        status: 'activated'
    });
    assert.strictEqual(testedToActivated.status, 403, 'tester must not activate firmware');

    const missingFirmware = await request(baseUrl, 'PUT', '/api/firmware/999999', tokens.tester, {
        status: 'tested'
    });
    assert.strictEqual(missingFirmware.status, 404);

    const activatedFirmware = await createFirmware(baseUrl, tokens.admin, seeded.project.id, seeded.module.id, 91);
    assert.strictEqual(activatedFirmware.status, 200);
    const adminActivate = await request(baseUrl, 'PUT', `/api/firmware/${activatedFirmware.body.data.id}`, tokens.admin, {
        version: '9.1.0',
        description: 'activate target',
        project_id: seeded.project.id,
        module_id: seeded.module.id,
        status: 'activated'
    });
    assert.strictEqual(adminActivate.status, 200);

    const testerActivatedToTested = await request(baseUrl, 'PUT', `/api/firmware/${activatedFirmware.body.data.id}`, tokens.tester, {
        status: 'tested'
    });
    assert.strictEqual(testerActivatedToTested.status, 403, 'tester must not modify activated firmware');
}

function findChromeExecutable() {
    const candidates = [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);
    return candidates.find(candidate => fs.existsSync(candidate));
}

function connectDevTools(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (!msg.id || !pending.has(msg.id)) return;
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
    };

    return {
        opened: new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = reject;
        }),
        send(method, params = {}) {
            const msgId = ++id;
            ws.send(JSON.stringify({ id: msgId, method, params }));
            return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
        },
        close() {
            ws.close();
        }
    };
}

async function waitForChrome(port, child) {
    for (let i = 0; i < 80; i += 1) {
        if (child.exitCode !== null) {
            throw new Error(`Chrome exited early with code ${child.exitCode}`);
        }
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) return;
        } catch (e) {
            // keep polling
        }
        await delay(100);
    }
    throw new Error('Chrome did not become ready');
}

async function pageEval(client, expression) {
    const { result, exceptionDetails } = await client.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
    });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
    return result.value;
}

async function waitForPageLoad(client) {
    for (let i = 0; i < 120; i += 1) {
        const state = await pageEval(client, 'document.readyState');
        if (state === 'complete') return;
        await delay(100);
    }
    throw new Error('page did not finish loading');
}

async function waitForPageCondition(client, expression, label) {
    let last = null;
    for (let i = 0; i < 100; i += 1) {
        last = await pageEval(client, expression);
        if (last && last.ok) return last;
        await delay(100);
    }
    throw new Error(`${label} did not become ready: ${JSON.stringify(last)}`);
}

let browserNavigationId = 0;

async function navigateRoute(client, baseUrl, route) {
    // A unique query makes every route visit a real navigation. Checking it in the
    // readiness predicate prevents a previous document with readyState=complete from
    // satisfying the wait before the new navigation commits.
    const navigationId = String(++browserNavigationId);
    await client.send('Page.navigate', { url: `${baseUrl}/index.html?testNav=${navigationId}#${route}` });
    await waitForPageLoad(client);
    return waitForPageCondition(client, `(() => {
        const view = document.getElementById('routeView');
        return {
            ok: new URLSearchParams(location.search).get('testNav') === ${JSON.stringify(navigationId)} &&
                !!document.querySelector('#routeView .page-content') &&
                !document.querySelector('.route-error') &&
                !document.querySelector('.route-loading') &&
                ((view && view.innerText || '').trim().length > 0),
            route: location.hash.replace('#', ''),
            title: document.getElementById('pageTitle')?.textContent?.trim() || '',
            textLength: (view && view.innerText || '').trim().length
        };
    })()`, `route ${route}`);
}

async function setBrowserUser(client, userData) {
    await pageEval(client, `(() => {
        localStorage.setItem('currentUser', ${JSON.stringify(JSON.stringify(userData))});
        localStorage.setItem('authToken', ${JSON.stringify(userData.token)});
        localStorage.setItem('firmwareLang', 'zh');
        return true;
    })()`);
}

async function waitForResponsiveLayout(client) {
    await pageEval(client, `new Promise(resolve => requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve(true))))`);
}

async function setViewport(client, {
    width,
    height,
    deviceScaleFactor = 1,
    mobile = false,
    touch = false,
    orientation = height >= width ? 'portraitPrimary' : 'landscapePrimary'
}) {
    const angle = orientation.startsWith('landscape') ? 90 : 0;
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile,
        screenWidth: width,
        screenHeight: height,
        screenOrientation: { type: orientation, angle }
    });
    await client.send('Emulation.setTouchEmulationEnabled', {
        enabled: touch,
        maxTouchPoints: touch ? 5 : 1
    });
    await waitForResponsiveLayout(client);
}

async function resetViewport(client) {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.clearDeviceMetricsOverride');
    await waitForResponsiveLayout(client);
}

async function withBrowser(baseUrl, fn) {
    const chrome = findChromeExecutable();
    assert.ok(chrome, 'Chrome executable not found; set CHROME_PATH to run frontend coverage tests');

    const chromePort = 9200 + Math.floor(Math.random() * 1000);
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xfms-chrome-test-'));
    const child = spawn(chrome, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${userDataDir}`,
        `${baseUrl}/login.html`
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let client = null;
    try {
        await waitForChrome(chromePort, child);
        const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(baseUrl + '/login.html')}`, {
            method: 'PUT'
        }).then(res => res.json());
        client = connectDevTools(target.webSocketDebuggerUrl);
        await client.opened;
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Page.navigate', { url: `${baseUrl}/login.html` });
        await waitForPageLoad(client);
        await fn(client);
    } finally {
        if (client) {
            try { client.close(); } catch (e) {}
        }
        child.kill('SIGTERM');
        await delay(200);
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

async function runFrontendRouteAndPermissionTests(baseUrl) {
    const routeExpectations = [
        ['dashboard', '系统主页'],
        ['firmware-list', '固件列表'],
        ['firmware-release', '发布固件'],
        ['module-management', '模块管理'],
        ['project-management', '项目管理'],
        ['user-management', '用户管理'],
        ['settings', '系统设置']
    ];

    await withBrowser(baseUrl, async (client) => {
        await setBrowserUser(client, roleUsers.admin.data);
        for (const [route, title] of routeExpectations) {
            const state = await navigateRoute(client, baseUrl, route);
            assert.strictEqual(state.route, route);
            assert.strictEqual(state.title, title);
        }

        const roleExpectations = {
            admin: {
                adminOnlyDisabled: false,
                releaseDisabled: false,
                firmwareModifyDisabled: false,
                firmwareStatusDisabled: false
            },
            developer: {
                adminOnlyDisabled: true,
                releaseDisabled: false,
                firmwareModifyDisabled: false,
                firmwareStatusDisabled: false
            },
            tester: {
                adminOnlyDisabled: true,
                releaseDisabled: true,
                firmwareModifyDisabled: true,
                firmwareStatusDisabled: false
            },
            user: {
                adminOnlyDisabled: true,
                releaseDisabled: true,
                firmwareModifyDisabled: true,
                firmwareStatusDisabled: true
            }
        };

        for (const [roleKey, expected] of Object.entries(roleExpectations)) {
            await setBrowserUser(client, roleUsers[roleKey].data);

            await navigateRoute(client, baseUrl, 'settings');
            const settings = await pageEval(client, `(() => ({
                maxFileSizeDisabled: document.getElementById('maxFileSize')?.disabled,
                defaultLanguageDisabled: document.getElementById('defaultLanguage')?.disabled,
                saveDisabled: document.getElementById('saveSettingsBtn')?.disabled,
                resetDisabled: document.getElementById('resetSettingsBtn')?.disabled
            }))()`);
            assert.strictEqual(settings.maxFileSizeDisabled, expected.adminOnlyDisabled, `${roleKey} maxFileSize UI`);
            assert.strictEqual(settings.defaultLanguageDisabled, expected.adminOnlyDisabled, `${roleKey} defaultLanguage UI`);
            assert.strictEqual(settings.saveDisabled, expected.adminOnlyDisabled, `${roleKey} save settings UI`);
            assert.strictEqual(settings.resetDisabled, expected.adminOnlyDisabled, `${roleKey} reset settings UI`);

            for (const [route, addSelector, rowSelector] of [
                ['project-management', '#addProjectBtn', '#projectListTable tr'],
                ['module-management', '#addModuleBtn', '#moduleListTable tr'],
                ['user-management', '#addUserBtn', '#userListTable tr']
            ]) {
                await navigateRoute(client, baseUrl, route);
                await waitForPageCondition(client, `(() => ({
                    ok: document.querySelectorAll('${rowSelector}').length > 0
                }))()`, `${route} table rows`);
                const state = await pageEval(client, `(() => {
                    const rows = Array.from(document.querySelectorAll('${rowSelector}'));
                    const editBtn = rows.flatMap(row => Array.from(row.querySelectorAll('button')))
                        .find(btn => btn.textContent.includes('✏️'));
                    const deleteBtn = rows.flatMap(row => Array.from(row.querySelectorAll('button')))
                        .find(btn => btn.textContent.includes('🗑️'));
                    return {
                        addDisabled: document.querySelector('${addSelector}')?.disabled,
                        editDisabled: editBtn ? editBtn.disabled : null,
                        deleteDisabled: deleteBtn ? deleteBtn.disabled : null
                    };
                })()`);
                assert.strictEqual(state.addDisabled, expected.adminOnlyDisabled, `${roleKey} ${route} add UI`);
                assert.strictEqual(state.editDisabled, expected.adminOnlyDisabled, `${roleKey} ${route} edit UI`);
                assert.strictEqual(state.deleteDisabled, expected.adminOnlyDisabled, `${roleKey} ${route} delete UI`);
            }

            await navigateRoute(client, baseUrl, 'firmware-list');
            await waitForPageCondition(client, `(() => ({
                ok: document.querySelectorAll('#firmwareListTable tr').length > 0 &&
                    !!document.querySelector('#firmwareListTable select.status-inline-select')
            }))()`, 'firmware table rows');
            const firmware = await pageEval(client, `(() => {
                const buttons = Array.from(document.querySelectorAll('#firmwareListTable button'));
                const editBtn = buttons.find(btn => btn.textContent.includes('✏️'));
                const deleteBtn = buttons.find(btn => btn.textContent.includes('🗑️'));
                const status = document.querySelector('#firmwareListTable select.status-inline-select');
                return {
                    releaseDisabled: document.getElementById('goReleaseFirmwareBtn')?.disabled,
                    statusDisabled: status ? status.disabled : null,
                    editDisabled: editBtn ? editBtn.disabled : null,
                    deleteDisabled: deleteBtn ? deleteBtn.disabled : null
                };
            })()`);
            assert.strictEqual(firmware.releaseDisabled, expected.releaseDisabled, `${roleKey} firmware release button UI`);
            assert.strictEqual(firmware.statusDisabled, expected.firmwareStatusDisabled, `${roleKey} firmware status UI`);
            assert.strictEqual(firmware.editDisabled, expected.firmwareModifyDisabled, `${roleKey} firmware edit UI`);
            assert.strictEqual(firmware.deleteDisabled, expected.firmwareModifyDisabled, `${roleKey} firmware delete UI`);

            await navigateRoute(client, baseUrl, 'firmware-release');
            const release = await pageEval(client, `(() => ({
                publishDisabled: document.getElementById('publishBtn')?.disabled,
                resetDisabled: document.getElementById('resetBtn')?.disabled,
                moduleDisabled: document.getElementById('releaseFirmwareModule')?.disabled,
                projectDisabled: document.getElementById('releaseFirmwareProject')?.disabled,
                fileInputDisabled: document.getElementById('firmwareFile')?.disabled,
                uploadAreaDisabled: document.getElementById('fileUploadArea')?.classList.contains('disabled')
            }))()`);
            assert.strictEqual(release.publishDisabled, expected.releaseDisabled, `${roleKey} publish button UI`);
            assert.strictEqual(release.resetDisabled, expected.releaseDisabled, `${roleKey} reset release UI`);
            assert.strictEqual(release.moduleDisabled, expected.releaseDisabled, `${roleKey} release module UI`);
            assert.strictEqual(release.projectDisabled, expected.releaseDisabled, `${roleKey} release project UI`);
            assert.strictEqual(release.fileInputDisabled, expected.releaseDisabled, `${roleKey} release file UI`);
            assert.strictEqual(release.uploadAreaDisabled, expected.releaseDisabled, `${roleKey} upload area UI`);
        }
    });
}

async function runResponsiveFrontendTests(baseUrl) {
    const routes = [
        'dashboard',
        'firmware-list',
        'firmware-release',
        'module-management',
        'project-management',
        'user-management',
        'settings'
    ];
    const managementRoutes = [
        ['firmware-list', '#firmwareListTable'],
        ['module-management', '#moduleListTable'],
        ['project-management', '#projectListTable'],
        ['user-management', '#userListTable']
    ];

    await withBrowser(baseUrl, async (client) => {
        try {
            await setBrowserUser(client, roleUsers.admin.data);

            // Keep route coverage representative rather than multiplying every route by
            // every breakpoint. Each route still proves the shell scroll contract at a
            // desktop and a narrow touch viewport.
            for (const viewport of [
                { width: 1366, height: 768, label: 'desktop' },
                { width: 390, height: 844, touch: true, label: 'phone' }
            ]) {
                await setViewport(client, viewport);
                for (const route of routes) {
                    await navigateRoute(client, baseUrl, route);
                    const layout = await pageEval(client, `(() => {
                        const view = document.getElementById('routeView');
                        const page = view && view.querySelector('.page-content');
                        const viewStyle = view && getComputedStyle(view);
                        const contentStyle = getComputedStyle(document.getElementById('contentArea'));
                        const pageRect = page && page.getBoundingClientRect();
                        const viewRect = view && view.getBoundingClientRect();
                        view.scrollTop = Math.min(80, Math.max(0, view.scrollHeight - view.clientHeight));
                        return {
                            pageCount: view ? view.querySelectorAll(':scope > .page-content').length : 0,
                            documentOverflow: document.documentElement.scrollWidth - innerWidth,
                            documentScrollTop: document.scrollingElement.scrollTop,
                            bodyOverflow: getComputedStyle(document.body).overflow,
                            contentOverflow: contentStyle.overflow,
                            viewOverflowX: viewStyle && viewStyle.overflowX,
                            viewOverflowY: viewStyle && viewStyle.overflowY,
                            viewHeight: view && view.getBoundingClientRect().height,
                            viewClientHeight: view && view.clientHeight,
                            pageInsideView: !!pageRect && !!viewRect &&
                                pageRect.left >= viewRect.left - 1 && pageRect.right <= viewRect.right + 1,
                            viewScrolledWhenPossible: !view || view.scrollHeight <= view.clientHeight || view.scrollTop > 0
                        };
                    })()`);
                    assert.strictEqual(layout.pageCount, 1, `${viewport.label} ${route} route page count`);
                    assert.ok(layout.documentOverflow <= 1, `${viewport.label} ${route} horizontal document overflow`);
                    assert.strictEqual(layout.documentScrollTop, 0, `${viewport.label} ${route} document must not scroll`);
                    assert.strictEqual(layout.bodyOverflow, 'hidden', `${viewport.label} ${route} body overflow`);
                    assert.strictEqual(layout.contentOverflow, 'hidden', `${viewport.label} ${route} content overflow`);
                    assert.strictEqual(layout.viewOverflowX, 'hidden', `${viewport.label} ${route} routeView overflow-x`);
                    assert.strictEqual(layout.viewOverflowY, 'auto', `${viewport.label} ${route} routeView overflow-y`);
                    assert.ok(Math.abs(layout.viewHeight - layout.viewClientHeight) <= 1,
                        `${viewport.label} ${route} routeView height`);
                    assert.ok(layout.pageInsideView, `${viewport.label} ${route} page must stay inside routeView`);
                    assert.ok(layout.viewScrolledWhenPossible, `${viewport.label} ${route} routeView must own scrolling`);
                }
            }

            // The navigation drawer changes mode exactly at 1200 CSS pixels.
            await setViewport(client, { width: 1201, height: 800 });
            await navigateRoute(client, baseUrl, 'dashboard');
            let sidebar = await pageEval(client, `(() => {
                const nav = document.getElementById('sidebar');
                const button = document.getElementById('mobileMenuBtn');
                return {
                    position: getComputedStyle(nav).position,
                    transform: getComputedStyle(nav).transform,
                    buttonDisplay: getComputedStyle(button).display
                };
            })()`);
            assert.notStrictEqual(sidebar.position, 'fixed', '1201px sidebar should be in desktop flow');
            assert.strictEqual(sidebar.transform, 'none', '1201px sidebar transform');
            assert.strictEqual(sidebar.buttonDisplay, 'none', '1201px menu button');

            await setViewport(client, { width: 1200, height: 800, touch: true });
            sidebar = await pageEval(client, `(() => {
                const nav = document.getElementById('sidebar');
                const button = document.getElementById('mobileMenuBtn');
                const rect = button.getBoundingClientRect();
                return {
                    position: getComputedStyle(nav).position,
                    buttonDisplay: getComputedStyle(button).display,
                    expanded: button.getAttribute('aria-expanded'),
                    touchWidth: rect.width,
                    touchHeight: rect.height
                };
            })()`);
            assert.strictEqual(sidebar.position, 'fixed', '1200px sidebar should be off canvas');
            assert.ok(sidebar.buttonDisplay === 'flex' || sidebar.buttonDisplay === 'inline-flex',
                '1200px menu button');
            assert.strictEqual(sidebar.expanded, 'false', 'closed drawer aria state');
            assert.ok(sidebar.touchWidth >= 44 && sidebar.touchHeight >= 44, 'menu touch target');
            await pageEval(client, `document.getElementById('mobileMenuBtn').click()`);
            let drawer = await waitForPageCondition(client, `(() => {
                const nav = document.getElementById('sidebar');
                const overlay = document.getElementById('mobileOverlay');
                const state = {
                    navActive: nav.classList.contains('active'),
                    overlayActive: overlay.classList.contains('active'),
                    expanded: document.getElementById('mobileMenuBtn').getAttribute('aria-expanded'),
                    left: nav.getBoundingClientRect().left
                };
                return { ok: state.navActive && state.overlayActive && Math.abs(state.left) <= 1, ...state };
            })()`, 'open mobile drawer');
            assert.ok(drawer.navActive && drawer.overlayActive, 'mobile drawer and overlay should open');
            assert.strictEqual(drawer.expanded, 'true', 'open drawer aria state');
            assert.ok(Math.abs(drawer.left) <= 1, 'open drawer must align to viewport');
            drawer = await pageEval(client, `(() => {
                document.getElementById('mobileOverlay').click();
                return {
                    navActive: document.getElementById('sidebar').classList.contains('active'),
                    overlayActive: document.getElementById('mobileOverlay').classList.contains('active'),
                    expanded: document.getElementById('mobileMenuBtn').getAttribute('aria-expanded')
                };
            })()`);
            assert.ok(!drawer.navActive && !drawer.overlayActive, 'overlay should close mobile drawer');
            assert.strictEqual(drawer.expanded, 'false', 'closed drawer aria state after overlay click');

            // Management pages switch from a table at 901px to labelled cards at 900px.
            for (const [route, tableSelector] of managementRoutes) {
                await setViewport(client, { width: 901, height: 800 });
                await navigateRoute(client, baseUrl, route);
                await waitForPageCondition(client, `(() => ({
                    ok: document.querySelectorAll('${tableSelector} tr').length > 0
                }))()`, `${route} 901px rows`);
                let table = await pageEval(client, `(() => {
                    const body = document.querySelector('${tableSelector}');
                    const view = document.getElementById('routeView');
                    const page = body.closest('.management-page');
                    const controls = Array.from(document.querySelectorAll('.btn-icon, .pagination-btn'))
                        .filter(control => control.getClientRects().length > 0);
                    view.scrollTop = view.scrollHeight;
                    return {
                        headDisplay: getComputedStyle(body.closest('table').tHead).display,
                        rowDisplay: getComputedStyle(body.querySelector('tr')).display,
                        pageOverflow: getComputedStyle(page).overflow,
                        routeCanReachBottom: view.scrollHeight <= view.clientHeight ||
                            Math.abs(view.scrollTop + view.clientHeight - view.scrollHeight) <= 1,
                        touchTargets: controls.map(control => {
                            const rect = control.getBoundingClientRect();
                            return { width: rect.width, height: rect.height };
                        })
                    };
                })()`);
                assert.notStrictEqual(table.headDisplay, 'none', `${route} header at 901px`);
                assert.notStrictEqual(table.rowDisplay, 'block', `${route} row at 901px`);
                assert.strictEqual(table.pageOverflow, 'visible', `${route} page overflow at 901px`);
                assert.ok(table.routeCanReachBottom, `${route} route must reach table bottom at 901px`);
                assert.ok(table.touchTargets.every(target => target.width >= 44 && target.height >= 44),
                    `${route} tablet touch targets at 901px: ${JSON.stringify(table.touchTargets)}`);

                await setViewport(client, { width: 900, height: 800, touch: true });
                await waitForResponsiveLayout(client);
                table = await pageEval(client, `(() => {
                    const body = document.querySelector('${tableSelector}');
                    const tableContainer = body.closest('.table-container');
                    const row = body.querySelector('tr');
                    const cells = Array.from(row.querySelectorAll('td:not([colspan])'));
                    const ordinaryCell = cells.find(cell => !cell.classList.contains('actions')) || cells[0];
                    const page = body.closest('.management-page');
                    const card = page.querySelector('.card');
                    return {
                        headDisplay: getComputedStyle(body.closest('table').tHead).display,
                        rowDisplay: getComputedStyle(row).display,
                        cellDisplay: ordinaryCell && getComputedStyle(ordinaryCell).display,
                        labels: cells.map(cell => cell.dataset.label || ''),
                        whiteSpace: ordinaryCell && getComputedStyle(ordinaryCell).whiteSpace,
                        overflowWrap: ordinaryCell && getComputedStyle(ordinaryCell).overflowWrap,
                        horizontalScroll: tableContainer.scrollWidth - tableContainer.clientWidth,
                        pageOverflow: getComputedStyle(page).overflow,
                        cardOverflow: getComputedStyle(card).overflow,
                        rowRight: row.getBoundingClientRect().right,
                        viewRight: document.getElementById('routeView').getBoundingClientRect().right
                    };
                })()`);
                assert.strictEqual(table.headDisplay, 'none', `${route} header at 900px`);
                assert.strictEqual(table.rowDisplay, 'block', `${route} card row at 900px`);
                assert.strictEqual(table.cellDisplay, 'flex', `${route} card cell at 900px`);
                assert.ok(table.labels.length > 0 && table.labels.every(Boolean), `${route} data-label cells`);
                assert.strictEqual(table.whiteSpace, 'normal', `${route} card value wrapping`);
                assert.strictEqual(table.overflowWrap, 'anywhere', `${route} overflow wrapping`);
                assert.ok(table.horizontalScroll <= 1, `${route} card table horizontal overflow`);
                assert.strictEqual(table.pageOverflow, 'visible', `${route} page scroll delegation`);
                assert.strictEqual(table.cardOverflow, 'visible', `${route} card scroll delegation`);
                assert.ok(table.rowRight <= table.viewRight + 1, `${route} card bounds`);
            }

            // Dashboard grid bands and semantic activity layout, including DPR-aware
            // canvas backing stores after a resize.
            await setViewport(client, { width: 1366, height: 900, deviceScaleFactor: 2 });
            await navigateRoute(client, baseUrl, 'dashboard');
            await waitForPageCondition(client, `(() => ({
                ok: document.querySelectorAll('#activityList .activity-row').length > 0 &&
                    Array.from(document.querySelectorAll('.charts-grid canvas')).every(canvas => canvas.width > 0)
            }))()`, 'desktop DPR2 dashboard');
            let dashboard = await pageEval(client, `(() => {
                const columnCount = selector => getComputedStyle(document.querySelector(selector))
                    .gridTemplateColumns.split(/\\s+/).filter(Boolean).length;
                const canvases = Array.from(document.querySelectorAll('.charts-grid canvas')).map(canvas => {
                    const rect = canvas.getBoundingClientRect();
                    return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height };
                });
                const rows = Array.from(document.querySelectorAll('#activityList .activity-row'));
                return {
                    statsColumns: columnCount('.stats-grid'),
                    chartColumns: columnCount('.charts-grid'),
                    canvases,
                    activitySemantic: rows.every(row => row.children.length === 3 &&
                        row.children[0].matches('span.activity-time') &&
                        row.children[1].matches('span.activity-action') &&
                        row.children[2].matches('span.activity-actor')),
                    activityColumns: getComputedStyle(rows[0]).gridTemplateColumns.split(/\\s+/).filter(Boolean).length
                };
            })()`);
            assert.strictEqual(dashboard.statsColumns, 6, 'desktop dashboard stats columns');
            assert.strictEqual(dashboard.chartColumns, 4, 'desktop dashboard chart columns');
            assert.ok(dashboard.activitySemantic, 'dashboard activity should use three semantic spans');
            assert.strictEqual(dashboard.activityColumns, 3, 'desktop activity columns');
            for (const canvas of dashboard.canvases) {
                assert.ok(Math.abs(canvas.width - Math.round(canvas.cssWidth * 2)) <= 1, 'DPR2 canvas width');
                assert.ok(Math.abs(canvas.height - Math.round(canvas.cssHeight * 2)) <= 1, 'DPR2 canvas height');
            }

            await setViewport(client, { width: 900, height: 800, deviceScaleFactor: 2, touch: true });
            await waitForPageCondition(client, `(() => {
                const canvas = document.getElementById('chartPending');
                const rect = canvas.getBoundingClientRect();
                return { ok: Math.abs(canvas.width - Math.round(rect.width * 2)) <= 1 };
            })()`, 'resized DPR2 dashboard');
            dashboard = await pageEval(client, `(() => ({
                statsColumns: getComputedStyle(document.querySelector('.stats-grid')).gridTemplateColumns.split(/\\s+/).length,
                chartColumns: getComputedStyle(document.querySelector('.charts-grid')).gridTemplateColumns.split(/\\s+/).length
            }))()`);
            assert.strictEqual(dashboard.statsColumns, 3, 'tablet dashboard stats columns');
            assert.strictEqual(dashboard.chartColumns, 2, 'tablet dashboard chart columns');

            await setViewport(client, { width: 390, height: 844, deviceScaleFactor: 2, touch: true });
            await waitForResponsiveLayout(client);
            dashboard = await pageEval(client, `(() => {
                const row = document.querySelector('#activityList .activity-row');
                const time = row.querySelector('.activity-time');
                const action = row.querySelector('.activity-action');
                const actor = row.querySelector('.activity-actor');
                const rowRect = row.getBoundingClientRect();
                return {
                    statsColumns: getComputedStyle(document.querySelector('.stats-grid')).gridTemplateColumns.split(/\\s+/).length,
                    chartColumns: getComputedStyle(document.querySelector('.charts-grid')).gridTemplateColumns.split(/\\s+/).length,
                    activityColumns: getComputedStyle(row).gridTemplateColumns.split(/\\s+/).length,
                    timeColumn: getComputedStyle(time).gridColumnStart,
                    timeRow: getComputedStyle(time).gridRowStart,
                    actionColumn: getComputedStyle(action).gridColumnStart,
                    actorColumn: getComputedStyle(actor).gridColumnStart,
                    actorRow: getComputedStyle(actor).gridRowStart,
                    actionInside: action.getBoundingClientRect().right <= rowRect.right + 1,
                    actionWrap: getComputedStyle(action).overflowWrap
                };
            })()`);
            assert.strictEqual(dashboard.statsColumns, 2, 'phone dashboard stats columns');
            assert.strictEqual(dashboard.chartColumns, 1, 'phone dashboard chart columns');
            assert.strictEqual(dashboard.activityColumns, 2, 'phone activity columns');
            assert.strictEqual(dashboard.timeColumn, '2', 'phone activity time column');
            assert.strictEqual(dashboard.timeRow, '1', 'phone activity time row');
            assert.strictEqual(dashboard.actionColumn, '1', 'phone activity action column');
            assert.strictEqual(dashboard.actorColumn, '2', 'phone activity actor column');
            assert.strictEqual(dashboard.actorRow, '2', 'phone activity actor row');
            assert.ok(dashboard.actionInside, 'phone activity action bounds');
            assert.strictEqual(dashboard.actionWrap, 'anywhere', 'phone activity action wrapping');

            // Mobile header dropdown must remain visible and contained.
            const dropdown = await pageEval(client, `(() => {
                const trigger = document.getElementById('userDropdownTrigger');
                trigger.click();
                const menu = document.getElementById('userDropdownMenu');
                const rect = menu.getBoundingClientRect();
                const triggerRect = trigger.getBoundingClientRect();
                return {
                    active: menu.classList.contains('active'),
                    display: getComputedStyle(menu).display,
                    left: rect.left,
                    right: rect.right,
                    triggerWidth: triggerRect.width,
                    triggerHeight: triggerRect.height,
                    nameDisplay: getComputedStyle(document.querySelector('.user-name')).display,
                    roleDisplay: getComputedStyle(document.querySelector('.user-role')).display
                };
            })()`);
            assert.ok(dropdown.active && dropdown.display === 'block', 'mobile user dropdown should open');
            assert.ok(dropdown.left >= -1 && dropdown.right <= 391, 'mobile dropdown bounds');
            assert.ok(dropdown.triggerWidth >= 44 && dropdown.triggerHeight >= 44, 'user dropdown touch target');
            assert.strictEqual(dropdown.nameDisplay, 'none', 'mobile username visibility');
            assert.strictEqual(dropdown.roleDisplay, 'none', 'mobile role visibility');
            await pageEval(client, `document.body.click()`);

            // Use the longest seeded admin modal to exercise short-height bounds and
            // touch targets without introducing test-only data.
            await navigateRoute(client, baseUrl, 'user-management');
            await waitForPageCondition(client, `(() => ({ ok: !!document.getElementById('addUserBtn') }))()`, 'user modal trigger');
            await pageEval(client, `document.getElementById('addUserBtn').click()`);
            await waitForPageCondition(client, `(() => {
                const overlay = document.getElementById('userModal');
                return { ok: !overlay.hidden && overlay.classList.contains('active') };
            })()`, 'user modal');
            const modal = await pageEval(client, `(() => {
                const overlay = document.getElementById('userModal');
                const dialog = overlay.querySelector('.modal');
                const body = overlay.querySelector('.modal-body');
                const scrollBox = overlay.querySelector('.form-scroll-box');
                const close = overlay.querySelector('.modal-close');
                const buttons = Array.from(overlay.querySelectorAll('.modal-footer .btn'));
                const rect = dialog.getBoundingClientRect();
                const closeRect = close.getBoundingClientRect();
                return {
                    top: rect.top,
                    left: rect.left,
                    right: rect.right,
                    bottom: rect.bottom,
                    dialogOverflow: getComputedStyle(dialog).overflow,
                    bodyOverflowY: getComputedStyle(body).overflowY,
                    scrollBoxMaxHeight: getComputedStyle(scrollBox).maxHeight,
                    scrollBoxOverflow: getComputedStyle(scrollBox).overflow,
                    closeWidth: closeRect.width,
                    closeHeight: closeRect.height,
                    buttonHeights: buttons.map(button => button.getBoundingClientRect().height)
                };
            })()`);
            assert.ok(modal.top >= -1 && modal.left >= -1 && modal.right <= 391 && modal.bottom <= 845,
                'mobile modal bounds');
            assert.strictEqual(modal.dialogOverflow, 'hidden', 'modal clips only its shell');
            assert.strictEqual(modal.bodyOverflowY, 'auto', 'modal body scroll owner');
            assert.strictEqual(modal.scrollBoxMaxHeight, 'none', 'modal form should not have a fixed height cap');
            assert.strictEqual(modal.scrollBoxOverflow, 'visible', 'modal form should delegate scrolling');
            assert.ok(modal.closeWidth >= 44 && modal.closeHeight >= 44, 'modal close touch target');
            assert.ok(modal.buttonHeights.length > 0 && modal.buttonHeights.every(height => height >= 44),
                'modal footer touch targets');
            await pageEval(client, `document.getElementById('closeUserModal').click()`);

            // A landscape handset is a separate short-height case.
            await setViewport(client, {
                width: 844,
                height: 390,
                deviceScaleFactor: 2,
                touch: true,
                orientation: 'landscapePrimary'
            });
            await navigateRoute(client, baseUrl, 'settings');
            const landscape = await pageEval(client, `(() => ({
                orientation: matchMedia('(orientation: landscape)').matches,
                overflow: document.documentElement.scrollWidth - innerWidth,
                menuVisible: getComputedStyle(document.getElementById('mobileMenuBtn')).display !== 'none',
                routeOverflowY: getComputedStyle(document.getElementById('routeView')).overflowY
            }))()`);
            assert.ok(landscape.orientation, 'landscape phone orientation');
            assert.ok(landscape.overflow <= 1, 'landscape phone horizontal overflow');
            assert.ok(landscape.menuVisible, 'landscape phone mobile navigation');
            assert.strictEqual(landscape.routeOverflowY, 'auto', 'landscape phone route scroll owner');

            // Login remains zoomable, scrollable on short phones, and touch friendly.
            await setViewport(client, {
                width: 390,
                height: 500,
                deviceScaleFactor: 2,
                mobile: true,
                touch: true,
                orientation: 'portraitPrimary'
            });
            await client.send('Page.navigate', { url: `${baseUrl}/login.html` });
            await waitForPageLoad(client);
            await waitForResponsiveLayout(client);
            let loginLayout = await pageEval(client, `(() => {
                const meta = document.querySelector('meta[name="viewport"]').content;
                const card = document.querySelector('.login-card').getBoundingClientRect();
                const containerStyle = getComputedStyle(document.querySelector('.login-container'));
                const targetSelectors = ['#loginLangToggle .login-lang-opt', '#username', '#password', '.toggle-password', '#loginBtn'];
                const targets = targetSelectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
                    .map(element => {
                        const rect = element.getBoundingClientRect();
                        return { selector: element.id || element.className, width: rect.width, height: rect.height };
                    });
                return {
                    meta,
                    cardLeft: card.left,
                    cardRight: card.right,
                    cardRadius: getComputedStyle(document.querySelector('.login-card')).borderRadius,
                    containerAlign: containerStyle.alignItems,
                    documentOverflow: document.documentElement.scrollWidth - innerWidth,
                    targets
                };
            })()`);
            assert.ok(loginLayout.meta.includes('width=device-width') && loginLayout.meta.includes('initial-scale=1.0'),
                'login viewport basics');
            assert.ok(loginLayout.meta.includes('viewport-fit=cover'), 'login safe-area viewport');
            assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i.test(loginLayout.meta),
                'login must allow zoom');
            assert.ok(loginLayout.cardLeft >= -1 && loginLayout.cardRight <= 391, 'login card bounds');
            assert.strictEqual(loginLayout.cardRadius, '12px', 'phone login card radius');
            assert.strictEqual(loginLayout.containerAlign, 'flex-start', 'short phone login alignment');
            assert.ok(loginLayout.documentOverflow <= 1, 'login horizontal overflow');
            assert.ok(loginLayout.targets.length > 0 && loginLayout.targets.every(target =>
                target.height >= 44 && (target.selector.includes('toggle-password') ? target.width >= 44 : true)),
            'login touch targets');

            loginLayout = await pageEval(client, `(() => {
                showMessage('A-very-long-unbroken-responsive-login-message-'.repeat(10), 'info');
                const message = document.querySelector('.message');
                const rect = message.getBoundingClientRect();
                const style = getComputedStyle(message);
                return {
                    left: rect.left,
                    right: rect.right,
                    width: rect.width,
                    whiteSpace: style.whiteSpace,
                    overflowWrap: style.overflowWrap
                };
            })()`);
            assert.ok(loginLayout.left >= -1 && loginLayout.right <= 391 && loginLayout.width <= 358,
                'login message bounds');
            assert.strictEqual(loginLayout.whiteSpace, 'normal', 'login message whitespace');
            assert.strictEqual(loginLayout.overflowWrap, 'anywhere', 'login message wrapping');
        } finally {
            await resetViewport(client);
        }
    });
}

async function main() {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xfms-full-api-test-'));
    const port = 4100 + Math.floor(Math.random() * 1000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['server/app.js'], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            PORT: String(port),
            XFMS_DB_PATH: path.join(tmpRoot, 'xfms-test.db'),
            XFMS_UPLOAD_DIR: path.join(tmpRoot, 'uploads')
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverOutput = '';
    child.stdout.on('data', (data) => { serverOutput += data.toString(); });
    child.stderr.on('data', (data) => { serverOutput += data.toString(); });

    try {
        await waitForServer(baseUrl, child);
        await runStep('auth and route access', () => runAuthAndRouteTests(baseUrl));

        const admin = await login(baseUrl, 'admin', 'admin');
        roleUsers.admin.data = admin;
        await seedUsers(baseUrl, admin.token);

        for (const key of ['developer', 'tester', 'user']) {
            roleUsers[key].data = await login(baseUrl, roleUsers[key].username, roleUsers[key].password);
        }

        const tokens = Object.fromEntries(
            Object.entries(roleUsers).map(([key, user]) => [key, user.data.token])
        );
        const seeded = await seedProjectModule(baseUrl, admin.token, 'base');

        await runStep('settings permissions and persistence', () => runSettingsTests(baseUrl, tokens));
        await runStep('CRUD permission matrix', () => runCrudPermissionMatrix(baseUrl, tokens, seeded));
        await runStep('validation and dependency guards', () => runValidationAndDependencyTests(baseUrl, tokens, seeded));
        await runStep('pagination search and filters', () => runPaginationSearchFilterTests(baseUrl, tokens, seeded));
        await runStep('firmware files downloads and activity logs', () => runFirmwareFileAndActivityTests(baseUrl, tokens, seeded));
        await runStep('tester firmware restrictions', () => runTesterFirmwareRestrictions(baseUrl, tokens, seeded));
        await runStep('frontend routes and permission UI', () => runFrontendRouteAndPermissionTests(baseUrl));
        await runStep('responsive frontend layouts', () => runResponsiveFrontendTests(baseUrl));

        console.log('full feature tests passed');
    } catch (err) {
        console.error(err.stack || err.message);
        console.error(serverOutput);
        process.exitCode = 1;
    } finally {
        child.kill('SIGTERM');
        await delay(200);
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main();
