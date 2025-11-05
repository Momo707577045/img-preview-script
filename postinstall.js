#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 查找项目的根目录（包含 package.json 且不在 node_modules 中的目录）
 */
function findProjectRoot(startDir) {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  // 如果当前目录在 node_modules 中，先跳出到 node_modules 的父目录
  while (currentDir !== root && currentDir.includes('node_modules')) {
    const basename = path.basename(currentDir);
    if (basename === 'node_modules') {
      currentDir = path.dirname(currentDir);
      break;
    }
    currentDir = path.dirname(currentDir);
  }

  // 从当前目录向上查找包含 package.json 的目录
  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    
    // 如果当前目录包含 package.json 且不在 node_modules 中
    if (fs.existsSync(packageJsonPath) && !currentDir.includes('node_modules')) {
      return currentDir;
    }
    
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * 添加 img-preview 命令到 package.json 的 scripts 中
 */
function addImgPreviewScript(projectRoot) {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log('[img-preview-script] 未找到 package.json，跳过添加脚本');
    return;
  }

  try {
    // 读取 package.json
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);

    // 初始化 scripts 对象（如果不存在）
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    // 检查是否已经存在 img-preview 命令
    if (packageJson.scripts['img-preview']) {
      console.log('[img-preview-script] package.json 中已存在 img-preview 命令，跳过添加');
      return;
    }

    // 添加 img-preview 命令
    packageJson.scripts['img-preview'] = 'img-preview';

    // 保存修改后的 package.json（保持原有格式）
    const updatedContent = JSON.stringify(packageJson, null, 2) + '\n';
    fs.writeFileSync(packageJsonPath, updatedContent, 'utf8');

    console.log('[img-preview-script] 已成功添加 img-preview 命令到 package.json 的 scripts 中');
    console.log('[img-preview-script] 你现在可以使用 npm run img-preview 来启动图片预览服务器');
  } catch (error) {
    console.error('[img-preview-script] 添加脚本时出错:', error.message);
  }
}

// 主函数
function main() {
  // 获取当前脚本所在的目录（通常是 node_modules/img-preview-script）
  const scriptDir = __dirname;
  
  // 查找项目根目录
  // 当包被安装时，postinstall 脚本会在包的安装目录中运行
  // 我们需要向上查找找到安装它的项目的根目录
  const projectRoot = findProjectRoot(scriptDir);

  if (!projectRoot) {
    console.log('[img-preview-script] 无法找到项目根目录，跳过添加脚本');
    return;
  }

  // 检查是否在本项目的目录中（避免修改自己的 package.json）
  const thisPackageJsonPath = path.join(scriptDir, 'package.json');
  const projectPackageJsonPath = path.join(projectRoot, 'package.json');
  
  if (fs.existsSync(thisPackageJsonPath) && fs.existsSync(projectPackageJsonPath)) {
    try {
      const thisPackageJson = JSON.parse(fs.readFileSync(thisPackageJsonPath, 'utf8'));
      const projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
      
      // 如果是同一个项目，跳过（开发时不需要修改）
      if (thisPackageJson.name === projectPackageJson.name) {
        console.log('[img-preview-script] 检测到这是 img-preview-script 项目本身，跳过添加脚本');
        return;
      }
    } catch (error) {
      // 如果读取 package.json 失败，继续执行
    }
  }

  // 添加脚本
  addImgPreviewScript(projectRoot);
}

// 执行主函数
main();

