// Vue 2 图片预览应用
new Vue({
    el: '#app',
    data: {
        images: [],
        currentImage: null,
        currentImageIndex: -1,
        lockedImage: null,
        hoverPreview: {
            show: false,
            image: null,
            style: {}
        },
        loading: true,
        error: null
    },
    
    computed: {
        codeSamples() {
            if (!this.currentImage) return [];
            
            const imageName = this.getImageVariableName(this.currentImage.name);
            const imagePath = this.currentImage.path;
            const imageUrl = this.currentImage.url;
            
            return [
                {
                    title: 'Vue 组件引用',
                    samples: [
                        `<TaImgBox :image="images['${imageName}']" class="absolute top-100px left-40px" />`,
                        `<img :src="require('@/assets/${imagePath}')" alt="${this.currentImage.name}" />`,
                        `<el-image :src="images.${imageName}" fit="cover" />`
                    ]
                },
            ];
        }
    },
    
    async mounted() {
        await this.loadImages();
        this.bindKeyboardEvents();
        this.initMasonryLayout();
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
            this.currentImage = this.images[index];
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
        
        // 锁定图片到右侧固定区域
        lockImage(image) {
            this.lockedImage = image || this.currentImage;
        },
        
        // 解锁固定图片
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
        
        // 复制代码
        async copyCode(code) {
            try {
                await navigator.clipboard.writeText(code);
                this.showToast('代码已复制到剪贴板');
            } catch (err) {
                // 兜底方案
                this.fallbackCopyText(code);
            }
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
                top: 20px;
                right: 20px;
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 10000;
                font-size: 14px;
                opacity: 0;
                transition: opacity 0.3s;
            `;
            toast.textContent = message;
            
            document.body.appendChild(toast);
            
            // 显示动画
            setTimeout(() => {
                toast.style.opacity = '1';
            }, 100);
            
            // 自动消失
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast.parentNode) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }, 2000);
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
                    this.layoutMasonry();
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
        }
    }
});