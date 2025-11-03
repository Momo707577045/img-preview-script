const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { exec } = require('child_process');

const app = express();

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: null,
    dir: null
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
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

// 解析命令行参数
const config = parseArgs();

// 确定端口
const PORT = config.port || getRandomPort();

// 确定扫描目录（默认是脚本所在目录）
const SCRIPT_DIR = __dirname;
let SCAN_DIR = config.dir ? path.resolve(config.dir) : SCRIPT_DIR;

// 验证扫描目录是否存在
if (!fs.existsSync(SCAN_DIR)) {
  console.error(`错误: 指定的目录不存在: ${SCAN_DIR}`);
  process.exit(1);
}

if (!fs.statSync(SCAN_DIR).isDirectory()) {
  console.error(`错误: 指定的路径不是目录: ${SCAN_DIR}`);
  process.exit(1);
}

// 中间件
app.use(cors());
app.use(express.json());

// 支持的图片格式
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

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

// 获取图片信息的API
app.get('/api/images', async (req, res) => {
  try {
    const images = getAllImages(SCAN_DIR);
    
    // 为每张图片添加尺寸信息
    const imagesWithDimensions = await Promise.all(
      images.map(async (image) => {
        const ext = path.extname(image.fullPath).toLowerCase();
        
        // 如果不是SVG，尝试获取图片尺寸
        if (ext !== '.svg') {
          try {
            const metadata = await sharp(image.fullPath).metadata();
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
    
    res.json({
      success: true,
      data: imagesWithDimensions,
      total: imagesWithDimensions.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 静态图片服务
app.get('/images/*', (req, res) => {
  try {
    const imagePath = decodeURIComponent(req.params[0]);
    const fullPath = path.join(SCAN_DIR, imagePath);
    
    // 安全检查，防止路径遍历攻击
    if (!fullPath.startsWith(SCAN_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // 设置适当的Content-Type
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.sendFile(fullPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取图片详细信息的API
app.get('/api/image-info/:path(*)', async (req, res) => {
  try {
    const imagePath = decodeURIComponent(req.params.path);
    const fullPath = path.join(SCAN_DIR, imagePath);
    
    if (!fullPath.startsWith(SCAN_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const stats = fs.statSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    
    let imageInfo = {
      name: path.basename(fullPath),
      path: imagePath,
      size: stats.size,
      modified: stats.mtime,
      extension: ext
    };
    
    // 如果不是SVG，尝试获取图片尺寸
    if (ext !== '.svg') {
      try {
        const metadata = await sharp(fullPath).metadata();
        imageInfo.width = metadata.width;
        imageInfo.height = metadata.height;
        imageInfo.format = metadata.format;
      } catch (err) {
        console.warn('Could not get image metadata:', err.message);
      }
    }
    
    res.json({
      success: true,
      data: imageInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 静态文件服务（前端文件）
app.use(express.static(SCRIPT_DIR));

// 打开浏览器的函数
function openBrowser(url) {
  const platform = process.platform;
  let command;
  
  switch (platform) {
    case 'darwin': // macOS
      command = `open "${url}"`;
      break;
    case 'win32': // Windows
      command = `start "" "${url}"`;
      break;
    default: // Linux 和其他
      command = `xdg-open "${url}"`;
      break;
  }
  
  exec(command, (error) => {
    if (error) {
      console.warn('无法自动打开浏览器，请手动访问:', url);
    }
  });
}

// 启动服务器
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`图片预览服务器运行在 ${url}`);
  console.log(`正在扫描目录: ${SCAN_DIR}`);
  console.log(`使用端口: ${PORT}`);
  
  // 自动打开浏览器
  setTimeout(() => {
    openBrowser(url);
  }, 500); // 延迟500ms确保服务器完全启动
});