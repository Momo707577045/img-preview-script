// Vue 2 图片预览应用
new Vue({
    el: '#app',
    data: {
        images: [],
        currentImage: null,
        currentImageIndex: -1,
        lockedImage: null,
        showModal: false,
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
                {
                    title: 'React 组件引用',
                    samples: [
                        `import ${imageName} from './${imagePath}';`,
                        `<img src={require('./${imagePath}')} alt="${this.currentImage.name}" />`,
                        `<Image src="${imageUrl}" alt="${this.currentImage.name}" />`
                    ]
                },
                {
                    title: 'HTML 引用',
                    samples: [
                        `<img src="${imageUrl}" alt="${this.currentImage.name}" />`,
                        `<img src="./${imagePath}" alt="${this.currentImage.name}" />`,
                        `<div style="background-image: url('${imageUrl}')"></div>`
                    ]
                },
                {
                    title: 'CSS 引用',
                    samples: [
                        `.bg-image { background-image: url('${imageUrl}'); }`,
                        `.bg-image { background-image: url('./${imagePath}'); }`,
                        `background: url('${imageUrl}') no-repeat center/cover;`
                    ]
                },
                {
                    title: 'JavaScript 引用',
                    samples: [
                        `const ${imageName} = '${imageUrl}';`,
                        `import ${imageName} from './${imagePath}';`,
                        `const imageUrl = require('./${imagePath}');`
                    ]
                }
            ];
        }
    },
    
    async mounted() {
        await this.loadImages();
        this.bindKeyboardEvents();
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
            this.showImagePreview();
        },
        
        // 显示图片预览弹窗
        showImagePreview() {
            if (!this.currentImage) return;
            this.showModal = true;
        },
        
        // 关闭预览弹窗
        closeModal() {
            this.showModal = false;
        },
        
        // 锁定图片到右侧固定区域
        lockImage() {
            if (!this.currentImage) return;
            this.lockedImage = this.currentImage;
            this.closeModal();
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
                if (e.key === 'Escape' && this.showModal) {
                    this.closeModal();
                }
            });
        }
    }
});