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
        scanDir: '', // 当前扫描的目录（用于区分不同项目）
        
        // 选中功能相关
        selectedImages: [], // 存储选中图片的路径
        
        // 搜索功能相关
        searchKeyword: '', // 搜索关键词
        
        // 代码模板相关
        selectedPreset: 'custom', // 选中的预设模板
        codeTemplate: '', // 代码模板
        isInitializingTemplate: false, // 标志：是否正在初始化模板（避免初始化时触发保存）
        templatePresets: {
            'custom': '<TaImgBox :image="images[\'{name}\']" class="absolute top-100px left-40px" />',
            'import': "import {name} from './{path}';",
            'require': "const {name} = require('./{path}');",
            'img': '<img src="{path}" alt="{name}" width="{width}" height="{height}" />',
            'markdown': '![{name}]({path})',
            'css-url': "background-image: url('{path}');",
            'path-only': '{path}'
        },
        // 保存默认的预设模板值（用于重置）
        defaultTemplatePresets: {
            'custom': '<TaImgBox :image="images[\'{name}\']" class="absolute top-100px left-40px" />',
            'import': "import {name} from './{path}';",
            'require': "const {name} = require('./{path}');",
            'img': '<img src="{path}" alt="{name}" width="{width}" height="{height}" />',
            'markdown': '![{name}]({path})',
            'css-url': "background-image: url('{path}');",
            'path-only': '{path}'
        },
        // JS代码自由组织功能
        useJsCode: false, // 是否使用JS代码模式
        // <TaImgBox :image="images[\'{name}\']" class="absolute top-100px left-40px" />
        jsCodeTemplate: `// 用户可以在这里编写JavaScript代码来处理图片数据
// 图片对象包含以下属性：
// - image.path: 文件路径
// - image.name: 完整文件名
// - image.url: 图片URL
// - image.width: 图片宽度
// - image.height: 图片高度
// - image.size: 文件大小（字节）
// 
// 示例代码：
const key = image.path.replace(/\\//g, '_').split('.')[0];
return \`<InfraBaseImgBox :image="images['\${key}']" />\`;`,
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
                    case 'size':
                        aValue = a.size || 0;
                        bValue = b.size || 0;
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
            
            // 应用搜索过滤
            if (this.searchKeyword && this.searchKeyword.trim()) {
                const keyword = this.searchKeyword.toLowerCase().trim();
                filtered = filtered.filter(image => {
                    const imageName = image.name.toLowerCase();
                    const imagePath = image.path.toLowerCase();
                    return imageName.includes(keyword) || imagePath.includes(keyword);
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
                        case 'size':
                            aValue = a.size || 0;
                            bValue = b.size || 0;
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
    
    watch: {
        // 监听搜索关键词变化
        searchKeyword() {
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 监听过滤后的图片列表变化
        filteredImages() {
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 监听代码模板变化
        codeTemplate(newVal) {
            this.templatePresets[this.selectedPreset] = newVal;
            // 如果不是初始化阶段，保存到 localStorage
            if (!this.isInitializingTemplate) {
                this.saveTemplateToStorage();
            }
        },
        
        // 监听预设模板变化
        selectedPreset() {
            // 如果不是初始化阶段，保存到 localStorage
            if (!this.isInitializingTemplate) {
                this.saveTemplateToStorage();
            }
        },
        
        // 监听JS代码模板变化
        jsCodeTemplate() {
            if (!this.isInitializingTemplate) {
                this.saveJsCodeToStorage();
            }
        },
        
        // 监听JS代码模式切换
        useJsCode() {
            if (!this.isInitializingTemplate) {
                this.saveJsCodeToStorage();
            }
        }
    },
    
    async mounted() {
        // 从 localStorage 恢复代码模板设置
        this.loadTemplateFromStorage();
        // 从 localStorage 恢复JS代码设置
        this.loadJsCodeFromStorage();
        
        await this.loadImages();
        this.bindKeyboardEvents();
        this.initMasonryLayout();
    },
    
    beforeDestroy() {
    },
    
    methods: {
        // 加载图片列表
        async loadImages() {
            try {
                this.loading = true;
                this.error = null;
                
                // 从 URL 获取端口并构建 API URL
                const urlObj = new URL(window.location.href);
                const port = urlObj.searchParams.get('port');
                const apiUrl = `http://localhost:${port}/api/images`;
                const response = await fetch(apiUrl);
                const result = await response.json();
                
                if (result.success) {
                    this.images = result.data?.map(image => ({
                        ...image,
                        url: `http://localhost:${port}${image.url}`,
                    })) || [];
                    // 保存当前扫描目录
                    if (result.dir) {
                        this.scanDir = result.dir;
                    } else if (result.scanDir) {
                        this.scanDir = result.scanDir;
                    }
                    // 初始化文件夹列表
                    this.initializeFolderList();
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
            this.copyImageCode(this.currentImage);
        },
        
        // 新 tab 打开
        openInNewTab(image) {
            window.open(image.url, '_blank');
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
        
        // 清除搜索
        clearSearch() {
            this.searchKeyword = '';
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 设置背景类型
        setBackground(type) {
            this.backgroundType = type;
        },
        
        // 格式化文件大小
        formatFileSize(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
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
            if (this.useJsCode) {
                // 使用JS代码模式
                code = this.generateCodeFromJs(image);
            } else {
                // 使用模板模式
                code = this.generateCodeFromTemplate(image);
            }
            this.copyText(code);
        },
        
        // 根据模板生成代码
        generateCodeFromTemplate(image) {
            if (!image) return '';
            
            // 获取文件扩展名（不含点）
            const ext = image.name.split('.').pop() || '';
            // 获取不含扩展名的文件名
            const nameWithoutExt = image.name.replace(/\.[^/.]+$/, '');
            
            // 替换模板变量
            let code = this.codeTemplate || '{path}';
            code = code.replace(/\{path\}/g, image.path || '');
            code = code.replace(/\{name\}/g, nameWithoutExt || '');
            code = code.replace(/\{fullname\}/g, image.name || '');
            code = code.replace(/\{width\}/g, image.width || '');
            code = code.replace(/\{height\}/g, image.height || '');
            code = code.replace(/\{size\}/g, this.formatFileSize(image.size) || '');
            code = code.replace(/\{ext\}/g, ext || '');
            
            return code;
        },
        
        // 根据JS代码生成代码
        generateCodeFromJs(image) {
            if (!image) return '';
            
            try {
                // 准备图片数据的副本，避免用户代码修改原始数据
                // 预计算一些便捷属性
                const nameWithoutExt = image.name.replace(/\.[^/.]+$/, '') || '';
                const ext = image.name.split('.').pop() || '';
                
                const imageData = {
                    path: image.path || '',
                    name: image.name || '',
                    url: image.url || '',
                    width: image.width || 0,
                    height: image.height || 0,
                    size: image.size || 0,
                    // 添加一些便捷的计算属性
                    nameWithoutExt: nameWithoutExt,
                    ext: ext,
                    formattedSize: this.formatFileSize(image.size || 0)
                };
                
                // 使用Function构造器安全地执行用户代码
                // 用户代码应该返回一个字符串
                const userCode = this.jsCodeTemplate || 'return image.path;';
                
                // 创建一个函数，接收image参数
                const codeFunction = new Function('image', `
                    ${userCode}
                `);
                
                // 执行函数并获取返回值
                const result = codeFunction(imageData);
                
                // 如果返回的不是字符串，尝试转换为字符串
                if (typeof result !== 'string') {
                    return String(result);
                }
                
                return result;
            } catch (error) {
                console.error('JS代码执行错误:', error);
                return `// 代码执行错误: ${error.message}\n// 图片路径: ${image.path}`;
            }
        },
        
        // 应用预设模板
        applyPreset() {
            this.codeTemplate = this.templatePresets[this.selectedPreset];
        },
        
        // 从 localStorage 加载模板设置
        loadTemplateFromStorage() {
            this.isInitializingTemplate = true; // 标记为初始化阶段
            
            try {
                const savedPreset = localStorage.getItem('codeTemplateSelectedPreset');
                const savedTemplate = localStorage.getItem('codeTemplateContent');
                
                // 恢复预设模板
                if (savedPreset !== null) {
                    this.selectedPreset = savedPreset;
                } else {
                    // 如果没有保存的值，使用默认值
                    this.selectedPreset = 'custom';
                }
                
                // 恢复代码模板
                if (savedTemplate !== null) {
                    this.codeTemplate = savedTemplate;
                } else {
                    // 如果没有保存的值，使用默认值
                    this.codeTemplate = this.templatePresets[this.selectedPreset] || "import {name} from './{path}';";
                }
            } catch (error) {
                console.error('加载模板设置失败:', error);
                // 加载失败时使用默认值
                this.selectedPreset = 'custom';
                this.codeTemplate = this.templatePresets[this.selectedPreset] || "import {name} from './{path}';";
            } finally {
                // 使用 $nextTick 确保所有 watch 都已执行完毕后再取消标志
                this.$nextTick(() => {
                    this.isInitializingTemplate = false;
                });
            }
        },
        
        // 保存模板设置到 localStorage
        saveTemplateToStorage() {
            try {
                localStorage.setItem('codeTemplateSelectedPreset', this.selectedPreset || '');
                localStorage.setItem('codeTemplateContent', this.codeTemplate || '');
            } catch (error) {
                console.error('保存模板设置失败:', error);
            }
        },
        
        // 从 localStorage 加载JS代码设置
        loadJsCodeFromStorage() {
            this.isInitializingTemplate = true;
            
            try {
                const savedUseJsCode = localStorage.getItem('useJsCode');
                const savedJsCodeTemplate = localStorage.getItem('jsCodeTemplate');
                
                // 恢复JS代码模式状态
                if (savedUseJsCode !== null) {
                    this.useJsCode = savedUseJsCode === 'true';
                }
                
                // 恢复JS代码模板
                if (savedJsCodeTemplate !== null) {
                    this.jsCodeTemplate = savedJsCodeTemplate;
                }
            } catch (error) {
                console.error('加载JS代码设置失败:', error);
            } finally {
                this.$nextTick(() => {
                    this.isInitializingTemplate = false;
                });
            }
        },
        
        // 保存JS代码设置到 localStorage
        saveJsCodeToStorage() {
            try {
                localStorage.setItem('useJsCode', String(this.useJsCode));
                localStorage.setItem('jsCodeTemplate', this.jsCodeTemplate || '');
            } catch (error) {
                console.error('保存JS代码设置失败:', error);
            }
        },
        
        // 重置预设模板
        resetPresetTemplates() {
            if (confirm('确定要重置当前预设模板吗？')) {
                this.codeTemplate = this.templatePresets[this.selectedPreset] = this.defaultTemplatePresets[this.selectedPreset];
                this.showToast('已重置');
            }
        },
        
        // 生成预览代码
        generatePreviewCode() {
            const previewImage = this.filteredImages?.length > 0 ? this.filteredImages[Math.max(0, this.currentImageIndex)] : null;
            if (!previewImage) return '';
            if (this.useJsCode) {
                return this.generateCodeFromJs(previewImage);
            } else {
                return this.generateCodeFromTemplate(previewImage);
            }
        },

        async copyText(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.showToast(text + '  已复制');
            } catch (err) {
                // 兜底方案
                this.fallbackCopyText(text);
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
        },
        
        // 解锁图片
        unlockImage() {
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
            
            // 加载保存的文件夹过滤配置
            const savedFilters = this.loadFolderFilters();
            
            // 初始化过滤器状态 - 使用响应式对象
            const filters = {};
            this.folderList.forEach(folder => {
                // 如果保存的配置中有该文件夹，使用保存的值；否则默认为 true
                filters[folder.path] = savedFilters[folder.path] !== undefined ? savedFilters[folder.path] : true;
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
        
        // 切换文件夹启用状态
        toggleFolder(folder) {
            folder.enabled = !folder.enabled;
            // 使用 Vue.set 确保响应式更新
            this.$set(this.folderFilters, folder.path, folder.enabled);
            
            // 保存文件夹过滤配置
            this.saveFolderFilters();
            
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
            
            // 保存文件夹过滤配置
            this.saveFolderFilters();
            
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
            
            // 保存文件夹过滤配置
            this.saveFolderFilters();
            
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
            
            // 保存文件夹过滤配置
            this.saveFolderFilters();
            
            // 强制重新渲染
            this.$forceUpdate();
            
            // 重新布局
            this.$nextTick(() => {
                this.layoutMasonry();
            });
        },
        
        // 获取 localStorage key（基于扫描目录）
        getFolderFiltersKey() {
            if (!this.scanDir) {
                return 'folderFilters_default';
            }
            // 使用目录路径的 hash 或者直接使用路径（处理特殊字符）
            return 'folderFilters_' + encodeURIComponent(this.scanDir).replace(/[^a-zA-Z0-9]/g, '_');
        },
        
        // 保存文件夹过滤配置到 localStorage
        saveFolderFilters() {
            try {
                const key = this.getFolderFiltersKey();
                localStorage.setItem(key, JSON.stringify(this.folderFilters));
            } catch (error) {
                console.error('保存文件夹过滤配置失败:', error);
            }
        },
        
        // 从 localStorage 加载文件夹过滤配置
        loadFolderFilters() {
            try {
                const key = this.getFolderFiltersKey();
                const saved = localStorage.getItem(key);
                if (saved) {
                    return JSON.parse(saved);
                }
            } catch (error) {
                console.error('加载文件夹过滤配置失败:', error);
            }
            return {};
        },
        

    }
});