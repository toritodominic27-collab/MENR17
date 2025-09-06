
// نظام الترجمة المشترك لجميع صفحات MERAC
window.MERACLang = {
  currentLang: localStorage.getItem('merac_lang') || 'ar',
  
  // الترجمات المشتركة
  common: {
    ar: {
      home: "الرئيسية",
      back: "العودة",
      language: "اللغة",
      loading: "جاري التحميل...",
      error: "خطأ",
      success: "نجح",
      cancel: "إلغاء",
      confirm: "تأكيد",
      close: "إغلاق",
      aboutInvestment: "عن استثمارنا"
    },
    en: {
      home: "Home",
      back: "Back", 
      language: "Language",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      confirm: "Confirm",
      close: "Close",
      aboutInvestment: "About Investment"
    }
  },

  // تطبيق الترجمة
  apply: function(customTranslations = {}) {
    const lang = this.currentLang;
    const translations = { ...this.common[lang], ...customTranslations[lang] };
    
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    
    // تطبيق الترجمات على العناصر التي تحتوي على data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[key]) {
        el.textContent = translations[key];
      }
    });

    // تحديث تسمية اللغة
    const langLabel = document.getElementById('langLabel');
    if (langLabel) langLabel.textContent = lang === 'ar' ? 'AR' : 'EN';
    
    return translations;
  },

  // تبديل اللغة
  toggle: function() {
    this.currentLang = this.currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('merac_lang', this.currentLang);
    return this.currentLang;
  },

  // إعداد أزرار التنقل المشتركة
  setupNavigation: function() {
    console.log('Setting up shared navigation...');
    
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
      homeBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Home button clicked, navigating to home.html');
        window.location.href = 'home.html';
      };
    }
    
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Back button clicked');
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = 'home.html';
        }
      };
    }
    
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
      langToggle.onclick = (e) => {
        e.preventDefault();
        console.log('Language toggle clicked');
        this.toggle();
        // إعادة تطبيق الترجمة - يجب على كل صفحة تعريف دالة refresh خاصة بها
        if (typeof window.refreshTranslations === 'function') {
          try {
            window.refreshTranslations();
          } catch (error) {
            console.error('Error refreshing translations:', error);
            // Fallback: reload page
            window.location.reload();
          }
        } else {
          // Fallback: reload page if no refresh function
          window.location.reload();
        }
      };
    }

    // إعداد زر "من نحن"
    const aboutBtn = document.getElementById('aboutBtn');
    if (aboutBtn) {
      aboutBtn.onclick = (e) => {
        e.preventDefault();
        console.log('About button clicked');
        this.showAboutModal();
      };
    }

    console.log('Shared navigation setup completed');
  },

  // عرض نافذة "من نحن"
  showAboutModal: function() {
    const lang = this.currentLang;
    const aboutContent = {
      ar: {
        title: "من نحن",
        content: `
          <h3 style="color: #87ceeb; margin-bottom: 1rem;">MERAC - منصة الاستثمار الذكي</h3>
          <p style="color: #d0d8e0; line-height: 1.6; margin-bottom: 1rem;">
            نحن منصة استثمارية متقدمة تقدم حلول استثمارية ذكية وآمنة مع عوائد يومية مضمونة.
            نهدف إلى تبسيط عالم الاستثمار وجعله متاحاً للجميع.
          </p>
          <div style="background: rgba(135, 206, 235, 0.1); padding: 1rem; border-radius: 8px; margin: 1rem 0;">
            <h4 style="color: #87ceeb; margin: 0 0 0.5rem 0;">مميزاتنا:</h4>
            <ul style="color: #d0d8e0; margin: 0; padding-right: 1.2rem;">
              <li>عوائد يومية مضمونة</li>
              <li>أمان عالي وشفافية كاملة</li>
              <li>دعم فني متاح 24/7</li>
              <li>نظام إحالات مربح</li>
            </ul>
          </div>
          <p style="color: #87ceeb; font-weight: bold; text-align: center; margin-top: 1.5rem;">
            استثمر بذكاء مع MERAC
          </p>
        `
      },
      en: {
        title: "About Us",
        content: `
          <h3 style="color: #87ceeb; margin-bottom: 1rem;">MERAC - Smart Investment Platform</h3>
          <p style="color: #d0d8e0; line-height: 1.6; margin-bottom: 1rem;">
            We are an advanced investment platform providing smart and secure investment solutions 
            with guaranteed daily returns. We aim to simplify the investment world and make it accessible to everyone.
          </p>
          <div style="background: rgba(135, 206, 235, 0.1); padding: 1rem; border-radius: 8px; margin: 1rem 0;">
            <h4 style="color: #87ceeb; margin: 0 0 0.5rem 0;">Our Features:</h4>
            <ul style="color: #d0d8e0; margin: 0; padding-left: 1.2rem;">
              <li>Guaranteed daily returns</li>
              <li>High security and complete transparency</li>
              <li>24/7 technical support</li>
              <li>Profitable referral system</li>
            </ul>
          </div>
          <p style="color: #87ceeb; font-weight: bold; text-align: center; margin-top: 1.5rem;">
            Invest Smart with MERAC
          </p>
        `
      }
    };

    // إنشاء النافذة المنبثقة إذا لم تكن موجودة
    let modal = document.getElementById('aboutModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aboutModal';
      modal.style.cssText = `
        display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        backdrop-filter: blur(6px); justify-content: center; align-items: center; z-index: 999;
      `;
      
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background: rgba(255,255,255,0.06); backdrop-filter: blur(25px) saturate(180%);
        border: 2px solid rgba(135,206,235,0.6); box-shadow: 0 0 20px rgba(135,206,235,0.5);
        border-radius: 18px; padding: 2rem; max-width: 500px; text-align: center;
        animation: fadeIn 0.4s ease; position: relative; max-height: 80vh; overflow-y: auto;
      `;
      
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.cssText = `
        background: transparent; border: none; color: #87ceeb; font-size: 1.5rem;
        position: absolute; top: 15px; right: 20px; cursor: pointer;
      `;
      closeBtn.onclick = () => modal.style.display = 'none';
      
      modalContent.appendChild(closeBtn);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      // إغلاق النافذة عند النقر خارجها
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }
    
    const modalContent = modal.querySelector('div');
    const content = aboutContent[lang];
    modalContent.innerHTML = `
      <button style="background: transparent; border: none; color: #87ceeb; font-size: 1.5rem; position: absolute; top: 15px; right: 20px; cursor: pointer;" onclick="document.getElementById('aboutModal').style.display='none'">&times;</button>
      ${content.content}
    `;
    
    modal.style.display = 'flex';
  }
};
