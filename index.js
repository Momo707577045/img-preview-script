// Vue 2 图片预览应用
new Vue({
    el: '#app',
    data: {
        images: [],
        currentImage: null,
        currentImageIndex: -1,
        lockedImage: null,
        sortBy: 'height',
        sortOrder: 'asc',
        backgroundType: 'gray',
        isResizing: false,
        hoverPreview: {
            show: false,
            image: null,
            style: {}
        },
        loading: true,
        error: null,
        // 文件夹过滤相关
        showFolderFilterModal: false,
        folderList: [],
        folderFilters: {}, // 存储文件夹的启用状态
        
        // 智能识别相关
        isRecognizing: false, // 是否正在识别
        recognitionProgress: '识别中...', // 识别进度文本
        recognitionProgressPercent: 0, // 识别进度百分比
        recognitionResults: [], // 识别结果
        hasRecognitionFilter: false, // 是否有识别过滤
        hasSimilarityData: false, // 是否有相似度数据
        opencvReady: false, // OpenCV是否加载完成
        
        // 选中功能相关
        selectedImages: [], // 存储选中图片的路径
        
        // 粘贴功能相关
        canPaste: false, // 是否可以粘贴
        isDragOver: false, // 是否正在拖拽
        pastedImages: [], // 存储粘贴的图片
        previewImage: null, // 当前预览的图片
    },
    
    computed: {
        sortedImages() {
            if (!this.sortBy) {
                return this.images;
            }
            
            const sorted = [...this.images].sort((a, b) => {
                let aValue, bValue;
                
                switch (this.sortBy) {
                    case 'width':
                        aValue = a.width || 0;
                        bValue = b.width || 0;
                        break;
                    case 'height':
                        aValue = a.height || 0;
                        bValue = b.height || 0;
                        break;
                    case 'path':
                        aValue = a.path || '';
                        bValue = b.path || '';
                        break;
                    case 'similarity':
                        aValue = a.similarity || 0;
                        bValue = b.similarity || 0;
                        break;
                    default:
                        return 0;
                }
                
                if (this.sortOrder === 'desc') {
                    return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
                } else {
                    return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
                }
            });
            
            return sorted;
        },
        
        // 应用文件夹过滤后的图片列表
        filteredImages() {
            let filtered = this.images;
            
            // 剔除render-result目录中的图片
            filtered = filtered.filter(image => {
                return !image.path.includes('render-result');
            });
            
            // 应用文件夹过滤
            if (this.hasActiveFilters) {
                filtered = filtered.filter(image => {
                    const folderPath = this.getFolderPath(image.path);
                    const isEnabled = this.folderFilters[folderPath] !== false;
                    return isEnabled;
                });
            }
            
            // 分离选中和未选中的图片
            const selectedImages = filtered.filter(image => this.selectedImages.includes(image.path));
            const unselectedImages = filtered.filter(image => !this.selectedImages.includes(image.path));
            
            // 只对未选中的图片进行排序
            let sortedUnselected = unselectedImages;
            if (this.sortBy) {
                sortedUnselected = [...unselectedImages].sort((a, b) => {
                    let aValue, bValue;
                    
                    switch (this.sortBy) {
                        case 'width':
                            aValue = a.width || 0;
                            bValue = b.width || 0;
                            break;
                        case 'height':
                            aValue = a.height || 0;
                            bValue = b.height || 0;
                            break;
                        case 'path':
                            aValue = a.path || '';
                            bValue = b.path || '';
                            break;
                        case 'similarity':
                            aValue = a.similarity || 0;
                            bValue = b.similarity || 0;
                            break;
                        default:
                            return 0;
                    }
                    
                    if (this.sortOrder === 'desc') {
                        return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
                    } else {
                        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
                    }
                });
            }
            
            // 选中的图片保持在顶部，未选中的图片按排序规则排列
            return [...selectedImages, ...sortedUnselected];
        },
        
        // 是否有激活的过滤器（即是否有被禁用的文件夹）
        hasActiveFilters() {
            return Object.values(this.folderFilters).some(enabled => enabled === false);
        },
        
        // 激活的过滤器数量（被禁用的文件夹数量）
        activeFilterCount() {
            return Object.values(this.folderFilters).filter(enabled => enabled === false).length;
        },
        
        // 是否有选中的图片
        hasSelectedImages() {
            return this.selectedImages.length > 0;
        },

        // render-result目录中的图片
        renderResultImages() {
            return this.images.filter(image => {
                return image.path.includes('render-result');
            });
        },
        

    },
    
    async mounted() {
        await this.loadImages();
        this.bindKeyboardEvents();
        this.initMasonryLayout();
        this.initOpenCV();
        this.initPasteFunction();
    },
    
    beforeDestroy() {
        // 清理粘贴的图片资源
        this.cleanupPastedImages();
        // 移除事件监听器
        document.removeEventListener('paste', this.handlePaste);
    },
    
    methods: {
        // 加载图片列表
        async loadImages() {
            try {
                this.loading = true;
                this.error = null;
                
                const response = await fetch('/api/images');
                const result = await response.json();
                
                if (result.success) {
                    this.images = result.data;
                    // 初始化文件夹列表
                    this.initializeFolderList();
                    // 自动添加render-result目录中的图片到粘贴区域
                    this.addRenderResultImages();
                    // 图片数据加载完成后重新布局
                    this.$nextTick(() => {
                        // 等待图片加载完成后再布局
                        setTimeout(() => {
                            this.layoutMasonry();
                        }, 100);
                    });
                } else {
                    this.error = '加载图片失败: ' + result.error;
                }
            } catch (error) {
                this.error = '网络错误: ' + error.message;
            } finally {
                this.loading = false;
            }
        },
        
        // 选择图片
        selectImage(index) {
            this.currentImageIndex = index;
            this.currentImage = this.filteredImages[index];
        },
        
        // 切换图片选中状态
        toggleImageSelection(image) {
            const index = this.selectedImages.indexOf(image.path);
            if (index > -1) {
                this.selectedImages.splice(index, 1);
            } else {
                this.selectedImages.push(image.path);
            }
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 检查图片是否被选中
        isImageSelected(image) {
            return this.selectedImages.includes(image.path);
        },
        
        // 取消全选
        deselectAllImages() {
            this.selectedImages = []
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },

        
        // 设置升序排序
        setSortAsc(sortBy) {
            this.sortBy = sortBy;
            this.sortOrder = 'asc';
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
                this.scrollToTop();
            });
        },
        
        // 设置降序排序
        setSortDesc(sortBy) {
            this.sortBy = sortBy;
            this.sortOrder = 'desc';
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
                this.scrollToTop();
            });
        },
        
        // 清除排序
        clearSort() {
            this.sortBy = null;
            this.sortOrder = 'asc';
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
                this.scrollToTop();
            });
        },
        
        // 设置背景类型
        setBackground(type) {
            this.backgroundType = type;
        },
        
        // 滚动到顶部
        scrollToTop() {
            const panelContent = document.querySelector('.panel-content');
            if (panelContent) {
                panelContent.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        },
        
        // 复制图片代码
        async copyImageCode(image) {
            let code;
            
            if (image.isPasted) {
                // 对于粘贴的图片，生成base64代码
                code = `<TaImgBox :image="pastedImages['${image.name}']" class="absolute top-100px left-40px" />`;
            } else {
                // 对于普通图片，使用原有的代码格式
                const imageName = this.getImageVariableName(image.name);
                code = `<TaImgBox :image="images['${imageName}']" class="absolute top-100px left-40px" />`;
            }
            
            try {
                await navigator.clipboard.writeText(code);
                this.showToast('代码已复制到剪贴板');
            } catch (err) {
                // 兜底方案
                this.fallbackCopyText(code);
            }
        },
        
        // 开始拖拽调整
        startResize(event) {
            this.isResizing = true;
            document.body.classList.add('resizing');
            
            const startX = event.clientX;
            const leftPanel = document.querySelector('.left-panel');
            const container = document.querySelector('.container');
            const startWidth = leftPanel.offsetWidth;
            const containerWidth = container.offsetWidth;
            
            const onMouseMove = (e) => {
                if (!this.isResizing) return;
                
                const deltaX = e.clientX - startX;
                const newWidth = startWidth + deltaX;
                const newWidthPercent = (newWidth / containerWidth) * 100;
                
                // 限制最小和最大宽度
                if (newWidthPercent >= 20 && newWidthPercent <= 80) {
                    leftPanel.style.width = newWidthPercent + '%';
                }
            };
            
            const onMouseUp = () => {
                this.isResizing = false;
                document.body.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                
                // 重新布局瀑布流
                this.$nextTick(() => {
                    this.layoutMasonry();
                });
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        },
        
        // 显示悬浮预览
        showHoverPreview(image, event) {
            const rect = event.currentTarget.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // 预设最大尺寸
            const maxPreviewWidth = 820; // 包含padding
            const maxPreviewHeight = 820; // 包含padding
            
            // 计算初始位置
            let left = rect.right + 10;
            let top = rect.top;
            
            // 如果右侧空间不够，显示在左侧
            if (left + maxPreviewWidth > viewportWidth) {
                left = rect.left - maxPreviewWidth - 10;
            }
            
            // 如果左侧空间也不够，居中显示
            if (left < 0) {
                left = Math.max(10, (viewportWidth - maxPreviewWidth) / 2);
            }
            
            // 垂直位置调整
            if (top + maxPreviewHeight > viewportHeight) {
                top = Math.max(10, viewportHeight - maxPreviewHeight - 10);
            }
            
            // 确保不超出屏幕顶部
            if (top < 10) {
                top = 10;
            }
            
            this.hoverPreview = {
                show: true,
                image: image,
                style: {
                    left: left + 'px',
                    top: top + 'px'
                }
            };
        },
        
        // 隐藏悬浮预览
        hideHoverPreview() {
            this.hoverPreview.show = false;
        },
        
        // 锁定图片（只锁定，不识别）
        lockImage(image) {
            this.lockedImage = image || this.currentImage;
            // 清除之前的相似度数据
            if (this.hasSimilarityData) {
                this.clearRecognitionFilter();
            }
            
            // 如果是粘贴的图片，显示特殊提示
            if (image && image.isPasted) {
                this.showToast(`已锁定粘贴的图片: ${image.name}`);
            }
        },
        
        // 锁定图片并开始识别
        lockAndRecognize(image) {
            this.lockedImage = image || this.currentImage;
            // 清除之前的相似度数据
            if (this.hasSimilarityData) {
                this.clearRecognitionFilter();
            }
            // 启动智能识别
            this.$nextTick(() => {
                this.startSmartRecognition();
            });
        },
        
        // 解锁图片
        unlockImage() {
            // 如果当前锁定的是粘贴的图片，询问是否要清理
            if (this.lockedImage && this.lockedImage.isPasted) {
                if (confirm('是否要清理粘贴的图片？')) {
                    this.cleanupPastedImages();
                }
            }
            this.lockedImage = null;
        },
        
        // 处理图片加载错误
        handleImageError(event) {
            event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDNIMTBMMTAgMjFIMjFWM1oiIGZpbGw9IiNmNWY1ZjUiLz4KPHBhdGggZD0iTTMgM0gxMEwxMCAyMUgzVjNaIiBmaWxsPSIjZTBlMGUwIi8+CjxwYXRoIGQ9Ik0xMiA4LjVMMTQuNSAxMUwxMiAxMy41TDkuNSAxMUwxMiA4LjVaIiBmaWxsPSIjOTk5Ii8+Cjwvc3ZnPgo=';
            event.target.style.opacity = '0.5';
        },
        
        // 图片加载完成后重新布局
        onImageLoad() {
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 获取图片变量名
        getImageVariableName(filename) {
            return filename
                .replace(/\.[^/.]+$/, '') // 移除扩展名
                .replace(/[^a-zA-Z0-9]/g, '_') // 替换特殊字符为下划线
                .replace(/^_+|_+$/g, '') // 移除开头和结尾的下划线
                .toLowerCase();
        },
        

        
        // 兜底复制方案
        fallbackCopyText(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                this.showToast('代码已复制到剪贴板');
            } catch (err) {
                this.showToast('复制失败，请手动复制');
            }
            
            document.body.removeChild(textArea);
        },
        
        // 显示提示消息
        showToast(message) {
            // 创建提示元素
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20%;
                left: 50%;
                transform: translate(-20%, -50%);
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 10000;
                font-size: 14px;
                opacity: 0;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                min-width: 200px;
                text-align: center;
            `;
            toast.textContent = message;
            
            document.body.appendChild(toast);
            
            // 显示动画
            setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 100);
            
            // 自动消失
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, -50%) scale(0.95)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }, 1000);
        },
        
        // 绑定键盘事件
        bindKeyboardEvents() {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.hoverPreview.show) {
                    this.hideHoverPreview();
                }
            });
        },
        
        // 初始化瀑布流布局
        initMasonryLayout() {
            this.$nextTick(() => {
                this.layoutMasonry();
                // 监听窗口大小变化
                window.addEventListener('resize', () => {
                    // 延迟执行以确保布局完成
                    setTimeout(() => {
                        this.layoutMasonry();
                    }, 100);
                });
            });
        },
        
        // 瀑布流布局计算
        layoutMasonry() {
            const container = document.getElementById('imageList');
            if (!container) return;
            
            const items = container.querySelectorAll('.image-item');
            if (items.length === 0) return;
            
            const containerWidth = container.offsetWidth;
            // 根据屏幕宽度调整项目宽度
            const isSmallScreen = window.innerWidth <= 768;
            const itemWidth = isSmallScreen ? 80 : 200;
            const gap = isSmallScreen ? 10 : 15;
            const columns = Math.floor((containerWidth + gap) / (itemWidth + gap));
            
            if (columns <= 0) return;
            
            // 更新项目宽度
            items.forEach(item => {
                item.style.width = itemWidth + 'px';
            });
            
            // 初始化每列的高度
            const columnHeights = new Array(columns).fill(0);
            
            items.forEach((item, index) => {
                // 找到最短的列
                const shortestColumnIndex = columnHeights.indexOf(Math.min(...columnHeights));
                
                // 计算位置
                const x = shortestColumnIndex * (itemWidth + gap);
                const y = columnHeights[shortestColumnIndex];
                
                // 设置位置
                item.style.left = x + 'px';
                item.style.top = y + 'px';
                
                // 更新该列的高度
                columnHeights[shortestColumnIndex] += item.offsetHeight + gap;
            });
            
            // 设置容器高度
            const maxHeight = Math.max(...columnHeights);
            container.style.height = maxHeight + 'px';
        },
        
        // 文件夹过滤相关方法
        
        // 初始化文件夹列表
        initializeFolderList() {
            const folderMap = new Map();
            
            this.images.forEach(image => {
                const folderPath = this.getFolderPath(image.path);
                
                if (folderMap.has(folderPath)) {
                    folderMap.get(folderPath).count++;
                } else {
                    folderMap.set(folderPath, {
                        path: folderPath,
                        count: 1,
                        enabled: true
                    });
                }
            });
            
            // 转换为数组并排序
            this.folderList = Array.from(folderMap.values()).sort((a, b) => {
                // 根目录排在最前面
                if (a.path === '') return -1;
                if (b.path === '') return 1;
                return a.path.localeCompare(b.path);
            });
            
            // 初始化过滤器状态 - 使用响应式对象
            const filters = {};
            this.folderList.forEach(folder => {
                filters[folder.path] = true;
            });
            this.folderFilters = filters;
        },
        
        // 从图片路径获取文件夹路径
        getFolderPath(imagePath) {
            const lastSlashIndex = imagePath.lastIndexOf('/');
            const lastBackslashIndex = imagePath.lastIndexOf('\\');
            const separatorIndex = Math.max(lastSlashIndex, lastBackslashIndex);
            
            if (separatorIndex === -1) {
                return ''; // 根目录
            }
            
            return imagePath.substring(0, separatorIndex);
        },
        
        // 显示文件夹过滤弹窗
        showFolderFilter() {
            this.showFolderFilterModal = true;
            // 更新文件夹列表的启用状态
            this.folderList.forEach(folder => {
                folder.enabled = this.folderFilters[folder.path] !== false;
            });
        },
        
        // 隐藏文件夹过滤弹窗
        hideFolderFilter() {
            this.showFolderFilterModal = false;
        },
        
        // 切换文件夹启用状态
        toggleFolder(folder) {
            folder.enabled = !folder.enabled;
            // 使用 Vue.set 确保响应式更新
            this.$set(this.folderFilters, folder.path, folder.enabled);
            
            // 强制重新渲染
            this.$forceUpdate();
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 全选文件夹
        selectAllFolders() {
            this.folderList.forEach(folder => {
                folder.enabled = true;
                this.$set(this.folderFilters, folder.path, true);
            });
            
            // 强制重新渲染
            this.$forceUpdate();
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 全不选文件夹
        deselectAllFolders() {
            this.folderList.forEach(folder => {
                folder.enabled = false;
                this.$set(this.folderFilters, folder.path, false);
            });
            
            // 强制重新渲染
            this.$forceUpdate();
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 重置文件夹过滤
        resetFolderFilter() {
            this.folderList.forEach(folder => {
                folder.enabled = true;
                this.$set(this.folderFilters, folder.path, true);
            });
            
            // 强制重新渲染
            this.$forceUpdate();
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 智能识别相关方法
        
        // 初始化OpenCV
        initOpenCV() {
            if (typeof cv !== 'undefined') {
                this.opencvReady = true;
            } else {
                // 等待OpenCV加载
                const checkOpenCV = () => {
                    if (typeof cv !== 'undefined') {
                        this.opencvReady = true;
                    } else {
                        setTimeout(checkOpenCV, 100);
                    }
                };
                checkOpenCV();
            }
        },
        

        
        // 开始智能识别
        async startSmartRecognition() {
            if (!this.opencvReady) {
                alert('OpenCV 未就绪，请稍后重试');
                return;
            }
            
            if (!this.lockedImage) {
                alert('请先锁定一张图片');
                return;
            }
            
            this.isRecognizing = true;
            this.recognitionProgress = '初始化中...';
            this.recognitionProgressPercent = 0;
            
            try {
                // 使用整张图片进行匹配
                console.log('使用整张图片进行匹配');
                const referenceImage = await this.loadImageForOpenCV(this.lockedImage.url);
                const referenceFeatures = this.extractFeatures(referenceImage);
                referenceImage.delete();
                
                this.recognitionProgress = '正在分析图片...';
                this.recognitionProgressPercent = 10;
                
                const results = [];
                const totalImages = this.images.length;
                
                // 批量处理图片，避免阻塞UI
                for (let i = 0; i < totalImages; i += 2) {
                    const batch = this.images.slice(i, i + 2);
                    const batchResults = await this.processBatch(batch, referenceFeatures);
                    results.push(...batchResults);
                    
                    // 更新进度
                    const progress = Math.round(((i + batch.length) / totalImages) * 100);
                    const progressPercent = Math.round(10 + (progress * 0.8)); // 10-90%
                    this.recognitionProgress = `正在识别图片 ${i + batch.length}/${totalImages}`;
                    this.recognitionProgressPercent = progressPercent;
                    
                    // 让出主线程，避免阻塞
                    await new Promise(resolve => setTimeout(resolve, 30));
                }
                
                // 将相似度数据整合到图片对象中
                this.integrateSimilarityData(results);
                
                // 自动按相似度降序排序
                this.setSortDesc('similarity');
                
                // 清理参考特征的内存
                this.cleanupFeatures(referenceFeatures);
                
            } catch (error) {
                console.error('智能识别错误:', error);
                alert('识别失败: ' + error.message);
            } finally {
                this.isRecognizing = false;
                this.recognitionProgress = '识别中...';
            }
        },
        
                // 批量处理图片
        async processBatch(batch, referenceFeatures) {
            const results = [];
            
            for (const image of batch) {
                try {
                    // 使用整张图片比较
                    const targetImage = await this.loadImageForOpenCV(image.url);
                    const targetFeatures = this.extractFeatures(targetImage);
                    const similarity = this.calculateSimilarity(referenceFeatures, targetFeatures);
                    
                    results.push({
                        image: image,
                        similarity: similarity
                    });
                    
                    // 清理内存
                    targetImage.delete();
                    this.cleanupFeatures(targetFeatures);
                } catch (error) {
                    console.warn('处理图片失败:', image.path, error);
                }
            }
            
            return results;
        },
        
        // 加载图片到OpenCV格式，支持区域选择
        loadImageForOpenCV(imageSrc, cropRegion = null) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        if (cropRegion) {
                            // 如果有裁剪区域，保持原始尺寸用于模板匹配
                            const { x, y, width, height } = cropRegion;
                            canvas.width = width;
                            canvas.height = height;
                            
                            // 绘制裁剪区域
                            ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
                        } else {
                            // 对于完整图片，适当缩放以提高性能
                            const maxSize = 800;
                            const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
                            canvas.width = img.width * scale;
                            canvas.height = img.height * scale;
                            
                            // 使用更好的缩放质量
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        }
                        
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const mat = cv.matFromImageData(imageData);
                        
                        resolve(mat);
                    } catch (error) {
                        reject(error);
                    }
                };
                
                img.onerror = () => {
                    reject(new Error('图片加载失败'));
                };
                
                img.src = imageSrc;
            });
        },
        
        // 提取图片特征 - 直接返回灰度图用于模板匹配
        extractFeatures(mat) {
            // 转换为灰度图
            const gray = new cv.Mat();
            cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
            
            // 不进行尺寸调整，保持原始尺寸用于模板匹配
            return gray;
        },
        
        // 计算相似度 - 使用模板匹配
        calculateSimilarity(template, targetImage) {
            try {
                // 确保模板小于目标图片
                if (template.rows > targetImage.rows || template.cols > targetImage.cols) {
                    // 如果模板比目标图片大，缩放模板
                    const scale = Math.min(targetImage.rows / template.rows, targetImage.cols / template.cols) * 0.8;
                    const newSize = new cv.Size(Math.floor(template.cols * scale), Math.floor(template.rows * scale));
                    const resizedTemplate = new cv.Mat();
                    cv.resize(template, resizedTemplate, newSize);
                    
                    const similarity = this.performTemplateMatching(resizedTemplate, targetImage);
                    resizedTemplate.delete();
                    return similarity;
                } else {
                    return this.performTemplateMatching(template, targetImage);
                }
            } catch (error) {
                console.warn('模板匹配错误:', error);
                return 0;
            }
        },
        
        // 执行模板匹配
        performTemplateMatching(template, targetImage) {
            try {
                const result = new cv.Mat();
                
                // 使用归一化相关系数匹配方法
                cv.matchTemplate(targetImage, template, result, cv.TM_CCOEFF_NORMED);
                
                // 找到最佳匹配位置
                const minMaxLoc = cv.minMaxLoc(result);
                const maxVal = minMaxLoc.maxVal;
                
                result.delete();
                
                // 返回匹配度（0-1之间）
                return Math.max(0, Math.min(1, maxVal));
            } catch (error) {
                console.warn('模板匹配执行错误:', error);
                return 0;
            }
        },
        
        // 清理特征对象内存
        cleanupFeatures(features) {
            if (features && features.delete) {
                features.delete();
            }
        },
        

        
        // 将相似度数据整合到图片对象中
        integrateSimilarityData(results) {
            // 创建相似度映射
            const similarityMap = new Map();
            results.forEach(result => {
                similarityMap.set(result.image.path, result.similarity);
            });
            
            // 将相似度数据添加到图片对象中
            this.images.forEach(image => {
                if (similarityMap.has(image.path)) {
                    // 相似度已经是0-1之间的值，直接使用
                    const similarity = similarityMap.get(image.path);
                    this.$set(image, 'similarity', similarity);
                } else {
                    this.$set(image, 'similarity', 0);
                }
            });
            
            // 标记有相似度数据
            this.hasSimilarityData = true;
            this.recognitionResults = results;
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 清除识别过滤
        clearRecognitionFilter() {
            // 清除所有图片的相似度数据
            this.images.forEach(image => {
                this.$delete(image, 'similarity');
            });
            
            this.recognitionResults = [];
            this.hasRecognitionFilter = false;
            this.hasSimilarityData = false;
            
            // 如果当前是相似度排序，切换到默认排序
            if (this.sortBy === 'similarity') {
                this.clearSort();
            }
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },

        // 初始化粘贴功能
        initPasteFunction() {
            // 检查剪贴板API是否可用
            this.canPaste = navigator.clipboard && navigator.clipboard.read;
            
            // 监听全局粘贴事件
            document.addEventListener('paste', this.handlePaste);
            
            // 监听键盘事件
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                    this.pasteFromClipboard();
                }
            });
        },

        // 从剪贴板粘贴
        async pasteFromClipboard() {
            try {
                if (!navigator.clipboard || !navigator.clipboard.read) {
                    this.showToast('您的浏览器不支持剪贴板API，请使用拖拽功能');
                    return;
                }

                const clipboardItems = await navigator.clipboard.read();
                for (const clipboardItem of clipboardItems) {
                    for (const type of clipboardItem.types) {
                        if (type.startsWith('image/')) {
                            const blob = await clipboardItem.getType(type);
                            await this.processPastedImage(blob, '剪贴板图片');
                            return;
                        }
                    }
                }
                this.showToast('剪贴板中没有图片');
            } catch (error) {
                console.error('粘贴失败:', error);
                this.showToast('粘贴失败: ' + error.message);
            }
        },

        // 处理拖拽事件
        handleDragOver(e) {
            e.preventDefault();
            this.isDragOver = true;
        },

        handleDragLeave(e) {
            e.preventDefault();
            this.isDragOver = false;
        },

        handleDrop(e) {
            e.preventDefault();
            this.isDragOver = false;
            
            const files = Array.from(e.dataTransfer.files);
            const imageFiles = files.filter(file => file.type.startsWith('image/'));
            
            if (imageFiles.length === 0) {
                this.showToast('请拖拽图片文件');
                return;
            }

            imageFiles.forEach(file => {
                this.processPastedImage(file, file.name);
            });
        },

        // 处理粘贴的图片
        async processPastedImage(blob, name) {
            try {
                // 创建图片对象
                const imageUrl = URL.createObjectURL(blob);
                const img = new Image();
                
                img.onload = () => {
                    const pastedImage = {
                        url: imageUrl,
                        name: name,
                        path: `pasted/${name}`,
                        width: img.width,
                        height: img.height,
                        isPasted: true, // 标记为粘贴的图片
                        blob: blob // 保存blob引用
                    };
                    
                    // 添加到粘贴图片列表
                    this.pastedImages.push(pastedImage);
                    
                    // 自动锁定这张图片到预览区域
                    this.lockImage(pastedImage);
                    
                    this.showToast(`成功粘贴并锁定图片: ${name}`);
                };
                
                img.onerror = () => {
                    this.showToast('图片加载失败');
                    URL.revokeObjectURL(imageUrl);
                };
                
                img.src = imageUrl;
                
            } catch (error) {
                console.error('处理粘贴图片失败:', error);
                this.showToast('处理图片失败: ' + error.message);
            }
        },

        // 处理全局粘贴事件
        handlePaste(e) {
            const items = e.clipboardData?.items;
            if (!items) return;
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (blob) {
                        this.processPastedImage(blob, '剪贴板图片');
                    }
                    break;
                }
            }
        },

        // 清理粘贴的图片资源
        cleanupPastedImages() {
            this.pastedImages.forEach(image => {
                if (image.url && image.url.startsWith('blob:')) {
                    URL.revokeObjectURL(image.url);
                }
            });
            this.pastedImages = [];
        },

        // 添加render-result目录中的图片到粘贴区域
        addRenderResultImages() {
            this.renderResultImages.forEach(image => {
                // 检查是否已经存在
                const exists = this.pastedImages.some(pasted => pasted.path === image.path);
                if (!exists) {
                    const renderImage = {
                        url: image.url,
                        name: image.name,
                        path: image.path,
                        width: image.width,
                        height: image.height,
                        isPasted: true, // 标记为粘贴的图片
                        isRenderResult: true // 标记为render-result图片
                    };
                    
                    this.pastedImages.push(renderImage);
                }
            });
            
            if (this.renderResultImages.length > 0) {
                this.showToast(`自动加载了 ${this.renderResultImages.length} 张render-result图片`);
            }
        },

        // 删除单个粘贴的图片
        removePastedImage(index) {
            const image = this.pastedImages[index];
            if (image) {
                // 如果当前锁定的是这张图片，先解锁
                if (this.lockedImage && this.lockedImage.path === image.path) {
                    this.lockedImage = null;
                }
                
                // 清理资源
                if (image.url && image.url.startsWith('blob:')) {
                    URL.revokeObjectURL(image.url);
                }
                
                // 从数组中移除
                this.pastedImages.splice(index, 1);
                
                this.showToast(`已删除图片: ${image.name}`);
            }
        },

        // 切换粘贴图片的锁定状态
        togglePastedImageLock(image) {
            if (this.lockedImage && this.lockedImage.path === image.path) {
                // 如果当前图片已锁定，则解锁
                this.unlockImage();
            } else {
                // 否则锁定这张图片
                this.lockImage(image);
            }
        },

        // 显示完整图片预览
        showFullPreview(image) {
            this.previewImage = image;
        },

        // 关闭预览
        closePreview() {
            this.previewImage = null;
        },

        // 开始识别并设置预览图
        startRecognitionWithPreview(image) {
            // 设置预览图
            this.previewImage = image;
            // 开始智能识别
            this.lockAndRecognize(image);
        }
    }
});