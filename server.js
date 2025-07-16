const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const app = express();
const PORT = 3000;

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
app.get('/api/images', (req, res) => {
  try {
    const currentDir = process.cwd();
    const images = getAllImages(currentDir);
    
    res.json({
      success: true,
      data: images,
      total: images.length
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
    const fullPath = path.join(process.cwd(), imagePath);
    
    // 安全检查，防止路径遍历攻击
    if (!fullPath.startsWith(process.cwd())) {
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
    const fullPath = path.join(process.cwd(), imagePath);
    
    if (!fullPath.startsWith(process.cwd())) {
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
app.use(express.static('.'));

// 启动服务器
app.listen(PORT, () => {
  console.log(`图片预览服务器运行在 http://localhost:${PORT}`);
  console.log(`正在扫描目录: ${process.cwd()}`);
});