document.addEventListener('DOMContentLoaded', () => {
    // Элементы
    const menuIcon = document.getElementById('menuIcon');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const whatIsIt = document.getElementById('whatIsIt');
    const instructionsLink = document.getElementById('instructionsLink');
    const featuresLink = document.getElementById('featuresLink');
    const aboutUsLink = document.getElementById('aboutUsLink');
    const tooltipPopup = document.getElementById('tooltipPopup');
    const closeTooltip = document.getElementById('closeTooltip');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeCard = document.getElementById('closeCard');
    const instructionsSection = document.getElementById('instructionsSection');
    const footer = document.getElementById('footer');
    const startBtn = document.getElementById('startBtn');

    // Флип-карты для touch-устройств
    const flipCards = document.querySelectorAll('.flip-card');
    
    // Проверяем, touch-устройство ли это
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    if (isTouchDevice) {
        flipCards.forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                // Убираем класс у всех остальных карт
                flipCards.forEach(c => {
                    if (c !== card && c.classList.contains('tapped')) {
                        c.classList.remove('tapped');
                    }
                });
                // Переключаем класс у текущей карты
                card.classList.toggle('tapped');
            });
        });
        
        // Закрываем карты при клике вне их
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.flip-card')) {
                flipCards.forEach(card => {
                    card.classList.remove('tapped');
                });
            }
        });
    }

    // Открыть/закрыть меню
    menuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        menuIcon.classList.toggle('active');
        dropdownMenu.classList.toggle('active');
    });

    // Закрыть меню при клике вне его
    document.addEventListener('click', (e) => {
        if (!menuIcon.contains(e.target) && !dropdownMenu.contains(e.target)) {
            menuIcon.classList.remove('active');
            dropdownMenu.classList.remove('active');
        }
    });

    // Пункт "Что это такое?"
    whatIsIt.addEventListener('click', () => {
        menuIcon.classList.remove('active');
        dropdownMenu.classList.remove('active');
        tooltipPopup.classList.add('active');
        setTimeout(() => {
            tooltipPopup.classList.remove('active');
        }, 3000);
    });

    closeTooltip.addEventListener('click', () => {
        tooltipPopup.classList.remove('active');
    });

    // Пункт "Инструкция" - плавный скролл к секции
    instructionsLink.addEventListener('click', () => {
        menuIcon.classList.remove('active');
        dropdownMenu.classList.remove('active');
        instructionsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Пункт "Функционал карты" - показать карточку
    featuresLink.addEventListener('click', () => {
        menuIcon.classList.remove('active');
        dropdownMenu.classList.remove('active');
        modalOverlay.classList.add('active');
    });

    // Закрыть карточку
    closeCard.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
    });

    // Закрыть карточку при клике на оверлей
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');
        }
    });

    // Пункт "О нас" - плавный скролл к футеру
    aboutUsLink.addEventListener('click', () => {
        menuIcon.classList.remove('active');
        dropdownMenu.classList.remove('active');
        footer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Кнопка "ДА" с плавным переходом
    if (startBtn) {
        startBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.body.style.transition = 'opacity 0.4s ease';
            document.body.style.opacity = '0';
            setTimeout(() => {
                window.location.href = 'nav.html';
            }, 400);
        });
    }
});
