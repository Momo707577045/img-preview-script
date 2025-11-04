#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const url = require('url');

// 显示帮助信息
function showHelp() {
  const helpText = `
图片预览服务器 - 用于预览目录中的图片文件

用法:
  img-preview [选项]

选项:
  -p, --port <端口>    指定服务器端口 (默认: 20000-25000 之间的随机端口)
  -d, --dir <目录>     指定要扫描的图片目录 (默认: 当前工作目录)
  -h, --help           显示此帮助信息

示例:
  img-preview                              # 使用默认设置启动服务器
  img-preview -p 8080                      # 指定端口为 8080
  img-preview -d ./images                 # 指定扫描目录为 ./images
  img-preview --port=8080 --dir=./images  # 使用等号形式指定参数
  img-preview -p 8080 -d ./images         # 组合使用多个参数

支持的图片格式:
  .jpg, .jpeg, .png, .gif, .bmp, .webp, .svg

说明:
  - 服务器启动后会自动打开浏览器访问预览页面
  - 如果未指定端口，将使用 20000-25000 之间的随机端口
  - 如果未指定目录，将扫描执行脚本时的工作目录及其子目录
  - 服务器会自动跳过 node_modules 和以 . 开头的目录
`;
  console.log(helpText);
  process.exit(0);
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: null,
    dir: null
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      showHelp();
    } else if (args[i] === '--port' || args[i] === '-p') {
      config.port = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--dir' || args[i] === '-d') {
      config.dir = args[i + 1];
      i++;
    } else if (args[i].startsWith('--port=')) {
      config.port = parseInt(args[i].split('=')[1]);
    } else if (args[i].startsWith('--dir=')) {
      config.dir = args[i].split('=')[1];
    }
  }
  
  return config;
}

// 获取随机端口（20000-25000）
function getRandomPort() {
  return Math.floor(Math.random() * (25000 - 20000 + 1)) + 20000;
}

// 支持的图片格式
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

// MIME 类型映射
const mimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json'
};

// 设置 CORS 头
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 发送 JSON 响应
function sendJSON(res, data, statusCode = 200) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

// 发送错误响应
function sendError(res, message, statusCode = 500) {
  sendJSON(res, { success: false, error: message }, statusCode);
}

// 读取文件的前几个字节（用于解析图片尺寸）
function readImageHeader(filePath, bytes) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { start: 0, end: bytes - 1 });
    const chunks = [];
    
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// 解析 PNG 图片尺寸
function parsePNG(buffer) {
  if (buffer.length < 24) return null;
  
  // PNG 文件头: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    // IHDR chunk 包含宽度和高度（大端序）
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height, format: 'png' };
  }
  
  return null;
}

// 解析 JPEG 图片尺寸
function parseJPEG(buffer) {
  if (buffer.length < 4) return null;
  
  // JPEG 文件头: FF D8
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    
    while (offset < buffer.length - 8) {
      // 跳过填充字节 (FF 00)
      if (buffer[offset] === 0xFF && buffer[offset + 1] === 0x00) {
        offset += 2;
        continue;
      }
      
      // 查找 SOF (Start of Frame) 标记
      // FF C0-C3: 非差分、霍夫曼编码的基线、扩展、渐进 DCT
      // FF C5-C7: 差分、霍夫曼编码的基线、扩展、渐进 DCT
      // FF C9-CB: 非差分、算术编码的基线、扩展、渐进 DCT
      // FF CD-CF: 差分、算术编码的基线、扩展、渐进 DCT
      if (buffer[offset] === 0xFF && 
          ((buffer[offset + 1] >= 0xC0 && buffer[offset + 1] <= 0xC3) ||
           (buffer[offset + 1] >= 0xC5 && buffer[offset + 1] <= 0xC7) ||
           (buffer[offset + 1] >= 0xC9 && buffer[offset + 1] <= 0xCB) ||
           (buffer[offset + 1] >= 0xCD && buffer[offset + 1] <= 0xCF))) {
        // 确保有足够的数据读取尺寸
        if (offset + 9 <= buffer.length) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height, format: 'jpeg' };
        }
      }
      
      // 跳过当前段
      if (buffer[offset] === 0xFF && buffer[offset + 1] !== 0xFF) {
        // 检查是否是段标记
        if (offset + 3 <= buffer.length) {
          const segmentLength = buffer.readUInt16BE(offset + 2);
          offset += 2 + segmentLength;
        } else {
          offset++;
        }
      } else {
        offset++;
      }
    }
  }
  
  return null;
}

// 解析 GIF 图片尺寸
function parseGIF(buffer) {
  if (buffer.length < 10) return null;
  
  // GIF 文件头: 47 49 46 38 (GIF8)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    // 宽度和高度在小端序的位置（GIF 是小端序）
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height, format: 'gif' };
  }
  
  return null;
}

// 解析 BMP 图片尺寸
function parseBMP(buffer) {
  if (buffer.length < 26) return null;
  
  // BMP 文件头: 42 4D (BM)
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    // 宽度和高度在小端序的位置
    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22)); // 高度可能是负数（从上到下）
    return { width, height, format: 'bmp' };
  }
  
  return null;
}

// 解析 WebP 图片尺寸（简化版，只支持 VP8/VP8L）
function parseWebP(buffer) {
  if (buffer.length < 30) return null;
  
  // WebP 文件头: RIFF ... WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    // VP8 格式
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x20) {
      const width = buffer.readUInt16LE(26) & 0x3FFF;
      const height = buffer.readUInt16LE(28) & 0x3FFF;
      return { width, height, format: 'webp' };
    }
    // VP8L 格式
    if (buffer[12] === 0x56 && buffer[13] === 0x50 && buffer[14] === 0x38 && buffer[15] === 0x4C) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3FFF) + 1;
      const height = ((bits >> 14) & 0x3FFF) + 1;
      return { width, height, format: 'webp' };
    }
  }
  
  return null;
}

// 获取图片尺寸（原生实现）
async function getImageMetadata(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    
    // 读取文件的前64KB（足够解析大多数图片格式的头部信息）
    const header = await readImageHeader(filePath, 65536);
    
    let result = null;
    
    switch (ext) {
      case '.png':
        result = parsePNG(header);
        break;
      case '.jpg':
      case '.jpeg':
        result = parseJPEG(header);
        break;
      case '.gif':
        result = parseGIF(header);
        break;
      case '.bmp':
        result = parseBMP(header);
        break;
      case '.webp':
        result = parseWebP(header);
        break;
    }
    
    if (result) {
      return result;
    }
    
    // 如果特定格式解析失败，尝试自动检测
    if (!result) result = parsePNG(header);
    if (!result) result = parseJPEG(header);
    if (!result) result = parseGIF(header);
    if (!result) result = parseBMP(header);
    if (!result) result = parseWebP(header);
    
    return result || { width: null, height: null, format: null };
  } catch (error) {
    return { width: null, height: null, format: null };
  }
}

// 递归遍历目录获取所有图片
function getAllImages(dir, baseDir = dir) {
  let images = [];
  
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // 跳过node_modules和.git等目录
        if (!file.startsWith('.') && file !== 'node_modules') {
          images = images.concat(getAllImages(filePath, baseDir));
        }
      } else if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const relativePath = path.relative(baseDir, filePath);
          const stats = fs.statSync(filePath);
          
          images.push({
            name: file,
            path: relativePath.replace(/\\/g, '/'), // 统一使用正斜杠
            fullPath: filePath,
            size: stats.size,
            modified: stats.mtime,
            url: `/images/${encodeURIComponent(relativePath.replace(/\\/g, '/'))}`
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return images;
}

// 处理 /api/images 路由
async function handleApiImages(req, res, scanDir) {
  try {
    const images = getAllImages(scanDir);
    
    // 为每张图片添加尺寸信息
    const imagesWithDimensions = await Promise.all(
      images.map(async (image) => {
        const ext = path.extname(image.fullPath).toLowerCase();
        
        // 如果不是SVG，尝试获取图片尺寸
        if (ext !== '.svg') {
          try {
            const metadata = await getImageMetadata(image.fullPath);
            return {
              ...image,
              width: metadata.width,
              height: metadata.height,
              format: metadata.format
            };
          } catch (err) {
            console.warn('Could not get image metadata for', image.path, ':', err.message);
            return {
              ...image,
              width: null,
              height: null,
              format: null
            };
          }
        } else {
          return {
            ...image,
            width: null,
            height: null,
            format: 'svg'
          };
        }
      })
    );
    
    sendJSON(res, {
      success: true,
      dir: scanDir,
      data: imagesWithDimensions,
      total: imagesWithDimensions.length
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
}

// 处理图片请求
function handleImage(req, res, imagePath, scanDir) {
  try {
    const decodedPath = decodeURIComponent(imagePath);
    const fullPath = path.join(scanDir, decodedPath);
    
    // 安全检查，防止路径遍历攻击（跨平台兼容）
    const normalizedFullPath = path.normalize(path.resolve(fullPath));
    const normalizedScanDir = path.normalize(path.resolve(scanDir));
    
    // 使用 toLowerCase() 确保 Windows 上的大小写不敏感比较
    if (!normalizedFullPath.toLowerCase().startsWith(normalizedScanDir.toLowerCase())) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    if (!fs.existsSync(fullPath)) {
      sendError(res, 'Image not found', 404);
      return;
    }
    
    // 设置适当的Content-Type
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    setCorsHeaders(res);
    res.setHeader('Content-Type', contentType);
    
    // 读取并发送文件
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      if (!res.headersSent) {
        sendError(res, error.message, 500);
      }
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
}

// 处理静态文件服务
function handleStaticFile(req, res, filePath, scriptDir) {
  try {
    const fullPath = path.join(scriptDir, filePath);
    
    // 安全检查（跨平台兼容）
    const normalizedFullPath = path.normalize(path.resolve(fullPath));
    const normalizedScriptDir = path.normalize(path.resolve(scriptDir));
    
    // 使用 toLowerCase() 确保 Windows 上的大小写不敏感比较
    if (!normalizedFullPath.toLowerCase().startsWith(normalizedScriptDir.toLowerCase())) {
      sendError(res, 'Access denied', 403);
      return;
    }
    
    if (!fs.existsSync(fullPath)) {
      sendError(res, 'File not found', 404);
      return;
    }
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // 如果是目录，尝试查找 img-preview.html
      const indexPath = path.join(fullPath, 'img-preview.html');
      if (fs.existsSync(indexPath)) {
        handleStaticFile(req, res, path.join(filePath, 'img-preview.html'), scriptDir);
      } else {
        sendError(res, 'File not found', 404);
      }
      return;
    }
    
    // 设置Content-Type
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    setCorsHeaders(res);
    res.setHeader('Content-Type', contentType);
    
    // 读取并发送文件
    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      if (!res.headersSent) {
        sendError(res, error.message, 500);
      }
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
}

// 打开浏览器的函数（跨平台兼容）
function openBrowser(url) {
  const platform = process.platform;
  let command;
  let shell = false;
  
  switch (platform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      // Windows 上需要使用 cmd.exe 来执行 start 命令
      command = `start "" "${url}"`;
      shell = true;
      break;
    default: // Linux 和其他
      command = `xdg-open "${url}"`;
      break;
  }
  
  exec(command, { shell }, (error) => {
    if (error) {
      console.warn('无法自动打开浏览器，请手动访问:', url);
    }
  });
}


// 启动服务器的函数（可导出供模块使用）
function startServer(options = {}) {
  const {
    port = null,
    dir = null,
    scriptDir = __dirname,
    autoOpen = true
  } = options;

  // 确定端口
  const PORT = port || getRandomPort();

  // 确定扫描目录（默认是执行脚本时的工作目录）
  const SCRIPT_DIR = scriptDir;
  let SCAN_DIR = dir ? path.resolve(dir) : process.cwd();

  // 验证扫描目录是否存在
  if (!fs.existsSync(SCAN_DIR)) {
    throw new Error(`指定的目录不存在: ${SCAN_DIR}`);
  }

  if (!fs.statSync(SCAN_DIR).isDirectory()) {
    throw new Error(`指定的路径不是目录: ${SCAN_DIR}`);
  }

  // 创建 HTTP 服务器
  const server = http.createServer(async (req, res) => {
    // 处理 OPTIONS 请求（CORS 预检）
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.statusCode = 200;
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // 路由处理
    if (pathname === '/api/images' && req.method === 'GET') {
      await handleApiImages(req, res, SCAN_DIR);
    } else if (pathname.startsWith('/images/')) {
      // 提取图片路径（去掉 /images/ 前缀）
      const imagePath = pathname.substring('/images/'.length);
      handleImage(req, res, imagePath, SCAN_DIR);
    } else {
      // 静态文件服务
      // 如果路径是 /，则返回 img-preview.html
      const filePath = pathname === '/' ? '/img-preview.html' : pathname;
      handleStaticFile(req, res, filePath, SCRIPT_DIR);
    }
  });

  // 启动服务器
  return new Promise((resolve, reject) => {
    server.listen(PORT, () => {
      // 自动打开浏览器
      if (autoOpen) {
        setTimeout(() => {
          let url = `http://localhost:${PORT}?port=${PORT}`;
          // 检查同级文件夹是否有 img-preview.html
          const indexPath = path.join(SCRIPT_DIR, 'img-preview.html');
          if (!fs.existsSync(indexPath)) {
            url = `https://blog.luckly-mjw.cn/tool-show/img-preview-script/img-preview.html?port=${PORT}`;
          }
          openBrowser(url);
          console.log(`图片预览服务器运行在 ${url}`);
          console.log(`正在扫描目录: ${SCAN_DIR}`);
          console.log(`使用端口: ${PORT}`);
        }, 500); // 延迟500ms确保服务器完全启动
      }
      resolve({ server, port: PORT, scanDir: SCAN_DIR });
    });

    server.on('error', reject);
  });
}

// 如果直接运行此文件（不是作为模块导入），则启动服务器
if (require.main === module) {
  const config = parseArgs();
  startServer({
    port: config.port,
    dir: config.dir,
    scriptDir: __dirname,
    autoOpen: true
  }).catch(error => {
    console.error('启动服务器失败:', error.message);
    process.exit(1);
  });
}

// 导出函数供模块使用
module.exports = {
  startServer,
  parseArgs,
  getRandomPort,
  getAllImages,
  getImageMetadata
};