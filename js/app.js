// --- FIREBASE SETUP ---
// Live config for the "emil-tech-portfolio" project; backs the reviews collection.
// To look it up again: Firebase Console -> Project settings -> General -> Your apps -> Web app.
// The apiKey below is not a secret — Firestore Security Rules (set in the
// Firebase Console) are what actually control who can read/write data, not this key.
const firebaseConfig = {
    apiKey: "AIzaSyBDd1cNftaUh952KAcnIzQ2hXwFv03Z9Co",
    authDomain: "emil-tech-portfolio.firebaseapp.com",
    projectId: "emil-tech-portfolio",
    storageBucket: "emil-tech-portfolio.firebasestorage.app",
    messagingSenderId: "98042606979",
    appId: "1:98042606979:web:d13b593436c51e6b5532b6"
};
// Guarded: if the Firebase CDN scripts fail to load (network hiccup, blocker, etc.)
// the rest of the page's JS (menu, service modals, etc.) must keep working regardless.
let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
} catch (err) {
    console.error('Firebase failed to initialize:', err);
}

// --- WHATSAPP CONTACT ---
// Single source of truth for the WhatsApp number (international format, no "+").
// The number also appears as a literal in the JSON-LD "telephone" field and in the
// "Chat on WhatsApp" link in the markup above — both of those have to work without
// JavaScript, so they can't read this constant. Update all three together.
const WHATSAPP_PHONE = "60198162602";

// Builds a wa.me link with the message escaped, so an "&" or "#" in user-supplied
// text can't cut the message short.
function whatsappLink(message) {
    return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

// Staggered scroll-reveal for the Core Tech Stack & Skills list
(function() {
    const rows = document.querySelectorAll('#skillsList .skill-row');
    if (!rows.length || !('IntersectionObserver' in window)) {
        rows.forEach(row => row.classList.add('is-visible'));
        return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const index = Array.from(rows).indexOf(entry.target);
                setTimeout(() => entry.target.classList.add('is-visible'), index * 90);
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });
    rows.forEach(row => observer.observe(row));
})();

// Set current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

// Mobile menu toggle logic
const menuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const mobileLinks = document.querySelectorAll('.mobile-link');
const icon = menuBtn.querySelector('i');

menuBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
    const isOpen = !mobileMenu.classList.contains('hidden');
    menuBtn.setAttribute('aria-expanded', String(isOpen));
    if(isOpen) {
        icon.classList.remove('ph-list');
        icon.classList.add('ph-x');
    } else {
        icon.classList.remove('ph-x');
        icon.classList.add('ph-list');
    }
});

// Close menu when clicking a link
mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
        icon.classList.remove('ph-x');
        icon.classList.add('ph-list');
    });
});

// --- SERVICE POP-UP MODAL JAVASCRIPT ---
function openModal(title, imageSrc, desc) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalImage').src = imageSrc;
    document.getElementById('modalDesc').innerText = desc;

    const modal = document.getElementById('serviceModal');
    const content = document.getElementById('modalContent');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('serviceModal');
    const content = document.getElementById('modalContent');

    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

document.getElementById('serviceModal').addEventListener('click', function(event) {
    if (event.target === this) {
        closeModal();
    }
});

// --- REVIEW MODAL JAVASCRIPT ---
let currentRating = 5; // Default 5 stars

function openReviewModal() {
    const modal = document.getElementById('reviewFormModal');
    const content = document.getElementById('reviewModalContent');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);
}

function closeReviewModal() {
    const modal = document.getElementById('reviewFormModal');
    const content = document.getElementById('reviewModalContent');
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

// Click outside to close review modal
document.getElementById('reviewFormModal').addEventListener('click', function(event) {
    if (event.target === this) {
        closeReviewModal();
    }
});

// Handle Interactive Star Clicks
function setRating(stars) {
    currentRating = stars;
    for(let i=1; i<=5; i++) {
        const starIcon = document.getElementById(`star-${i}`);
        if(i <= stars) {
            starIcon.classList.remove('ph', 'text-slate-600');
            starIcon.classList.add('ph-fill', 'text-yellow-400');
        } else {
            starIcon.classList.add('ph', 'text-slate-600');
            starIcon.classList.remove('ph-fill', 'text-yellow-400');
        }
    }
}

// --- LIVE REVIEWS: render cards from Firestore ---
const AVATAR_COLORS = [
    { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
    { bg: 'bg-purple-500/20', text: 'text-purple-300' },
    { bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
    { bg: 'bg-amber-500/20', text: 'text-amber-300' },
    { bg: 'bg-rose-500/20', text: 'text-rose-300' },
];

function initialsFor(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function starsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += i <= rating
            ? '<i class="ph-fill ph-star text-lg"></i>'
            : '<i class="ph ph-star text-lg"></i>';
    }
    return html;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function reviewCardHtml(review, index) {
    const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const avatar = `<div class="w-12 h-12 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-bold text-lg">${escapeHtml(initialsFor(review.name))}</div>`;

    return `
        <div class="hud-card p-8 rounded-2xl relative">
            <div class="flex text-yellow-400 mb-4 space-x-1">${starsHtml(review.rating)}</div>
            <p class="text-slate-300 leading-relaxed mb-6 italic">"${escapeHtml(review.text)}"</p>
            <div class="flex items-center space-x-4 mt-auto">
                ${avatar}
                <div>
                    <h4 class="font-bold text-white text-sm">${escapeHtml(review.name)}</h4>
                    <p class="text-xs text-slate-400 uppercase tracking-wider">${escapeHtml(review.role)}</p>
                </div>
            </div>
        </div>`;
}

// A review is shown only if every field looks right, so one malformed entry can't
// break the whole section.
function isDisplayableReview(r) {
    return r
        && typeof r.name === 'string' && r.name.trim() !== ''
        && typeof r.role === 'string' && r.role.trim() !== ''
        && typeof r.text === 'string' && r.text.trim() !== ''
        && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5;
}

function renderReviews(reviews) {
    reviews = reviews.filter(isDisplayableReview);
    const loadingEl = document.getElementById('reviewsLoading');
    const emptyEl = document.getElementById('reviewsEmpty');
    const listEl = document.getElementById('reviewsList');

    loadingEl.classList.add('hidden');
    if (!reviews.length) {
        emptyEl.classList.remove('hidden');
        listEl.innerHTML = '';
        return;
    }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = reviews.map(reviewCardHtml).join('');
}

function loadReviews() {
    if (!db) {
        document.getElementById('reviewsLoading').textContent = 'Reviews are temporarily unavailable.';
        return;
    }
    // Only approved reviews are public (the Firestore rules enforce this too). Filtering on
    // `approved` alone uses Firestore's automatic index; the newest 30 are picked here.
    db.collection('reviews')
        .where('approved', '==', true)
        .get()
        .then(snapshot => {
            const reviews = [];
            snapshot.forEach(doc => reviews.push(doc.data()));
            const millis = r => (r.createdAt && typeof r.createdAt.toMillis === 'function') ? r.createdAt.toMillis() : 0;
            reviews.sort((a, b) => millis(b) - millis(a));
            renderReviews(reviews.slice(0, 30));
        })
        .catch(err => {
            console.error('Failed to load reviews:', err);
            document.getElementById('reviewsLoading').textContent = 'Reviews are temporarily unavailable.';
        });
}
loadReviews();

// Handle Form Submission -> save review + notify via WhatsApp
function showReviewFormError(message) {
    const el = document.getElementById('reviewFormError');
    el.textContent = message;
    el.classList.remove('hidden');
}

function clearReviewFormError() {
    document.getElementById('reviewFormError').classList.add('hidden');
}

async function submitReview(event) {
    event.preventDefault();
    clearReviewFormError();

    if (!db) {
        return showReviewFormError('Reviews are temporarily unavailable. Please try again later.');
    }

    // Honeypot: real visitors never fill this hidden field
    if (document.getElementById('reviewWebsite').value) {
        closeReviewModal();
        document.getElementById('reviewForm').reset();
        setRating(5);
        return;
    }

    const name = document.getElementById('reviewName').value.trim();
    const role = document.getElementById('reviewRole').value.trim();
    const text = document.getElementById('reviewText').value.trim();

    if (!name || name.length > 60) return showReviewFormError('Please enter a name (up to 60 characters).');
    if (!role || role.length > 60) return showReviewFormError('Please enter a role/company (up to 60 characters).');
    if (!text || text.length > 500) return showReviewFormError('Please enter a review (up to 500 characters).');
    if (currentRating < 1 || currentRating > 5) return showReviewFormError('Please choose a star rating.');

    // Simple client-side throttle to curb accidental double-submits
    const lastSubmit = Number(localStorage.getItem('lastReviewSubmit') || 0);
    if (Date.now() - lastSubmit < 60 * 1000) {
        return showReviewFormError("You've just submitted a review — thanks! Please wait a moment before submitting another.");
    }

    const submitBtn = document.getElementById('reviewSubmitBtn');
    const submitBtnText = document.getElementById('reviewSubmitBtnText');
    submitBtn.disabled = true;
    submitBtnText.textContent = 'Posting...';

    try {
        // New reviews start hidden; the owner approves them in the Firebase console.
        const reviewData = {
            name, role, text,
            rating: currentRating,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            approved: false
        };

        await db.collection('reviews').add(reviewData);
        localStorage.setItem('lastReviewSubmit', String(Date.now()));

        // Notify the site owner via WhatsApp (the review itself is already saved above)
        window.open(whatsappLink(
            `*NEW WEBSITE REVIEW!*\n\n*Name:* ${name}\n*Role:* ${role}\n*Rating:* ${currentRating} Stars ⭐️\n*Review:* "${text}"\n\n_Approve it in Firebase (Firestore > reviews > set approved to true) to show it on the site._`
        ), '_blank');

        closeReviewModal();
        document.getElementById('reviewForm').reset();
        setRating(5);
        document.getElementById('reviewThanks').classList.remove('hidden');
    } catch (err) {
        console.error('Failed to submit review:', err);
        showReviewFormError('Something went wrong posting your review. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtnText.textContent = 'Post Review';
    }
}

// --- CONTACT FORM ---
function showContactFormError(message) {
    const el = document.getElementById('contactFormError');
    el.textContent = message;
    el.classList.remove('hidden');
}

function clearContactFormError() {
    document.getElementById('contactFormError').classList.add('hidden');
}

// Hands the visitor off to WhatsApp with their name and message already typed out,
// so they don't have to repeat themselves once the chat opens.
function sendContactMessage(event) {
    event.preventDefault();
    clearContactFormError();

    const name = document.getElementById('contactName').value.trim();
    const message = document.getElementById('contactMessage').value.trim();

    if (!name || name.length > 60) return showContactFormError('Please enter a name (up to 60 characters).');
    if (!message || message.length > 1000) return showContactFormError('Please enter a message (up to 1000 characters).');

    window.open(whatsappLink(
        `*NEW ENQUIRY FROM EMILTECH.IT.COM*\n\n*Name:* ${name}\n*Message:* ${message}`
    ), '_blank');

    document.getElementById('contactForm').reset();
}

// --- EVENT WIRING ---
// Handlers are attached here rather than with onclick="..." attributes, so the
// Content-Security-Policy can forbid all inline script.
document.querySelectorAll('[data-modal-title]').forEach(card => {
    card.addEventListener('click', () => {
        openModal(card.dataset.modalTitle, card.dataset.modalImage, card.dataset.modalDesc);
    });
});
document.getElementById('serviceModalClose').addEventListener('click', closeModal);
document.getElementById('openReviewBtn').addEventListener('click', openReviewModal);
document.getElementById('reviewModalClose').addEventListener('click', closeReviewModal);
document.getElementById('starContainer').addEventListener('click', (event) => {
    const star = event.target.closest('[data-rating]');
    if (star) setRating(Number(star.dataset.rating));
});
document.getElementById('reviewForm').addEventListener('submit', submitReview);
document.getElementById('contactForm').addEventListener('submit', sendContactMessage);
