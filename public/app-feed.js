/* =============================================================================
   EMPYREAN INTERNATIONAL — SOCIAL FEED
   app-feed.js  |  Step 0.8  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Complete social feed system extracted from app-fixes.js.  Covers:

     • Post card builder — createNewPostElement()
     • SOS feed card — createSosPostOnFeed()
     • Crisis feed card — createCrisisPostOnFeed()
     • All 8 real-time Firestore onSnapshot listeners — _startRealtimeListeners()
         posts | news | marketplace | reels | sos_queue | crisis_reports
         announcements | users
     • Dashboard news slider — renderDashboardNews()
     • Suggested users widget — renderSuggestedUsers()
     • Profile gallery URL accumulator — _addUrlsToProfileGallery()
     • Reel viewer — setupReelViewerObserver() + openReelViewer()
     • View-count IntersectionObserver setup

   LOAD ORDER
   ──────────
   ... all prior modules (state, helpers, contracts, notifications, tags,
       dom, auth) must be loaded before this file.
   <script src="app-feed.js">

   DEPENDS ON
   ──────────
   • window.fbDb / window._firebaseLoaded (firebase-init.js)
   • window.EmpState / window.userState / window.isGuest / window.isAdmin
   • window.formatWhatsAppText   (app-helpers.js)
   • window.handleYoutubeEmbed   (app-tags.js)
   • window.showNotification     (app-helpers.js)
   • window.pushNotification     (app-notifications.js)
   • window._processPostTags     (app-tags.js)
   • window.renderUserProfile    (app-profile.js)
   • window.navigateTo           (app-dom.js)
   • window.createSosPostOnFeed  — defined here, used by sos listener
   • window.createCrisisPostOnFeed — defined here, used by crisis listener
   • window._scheduleListenerRetry (app-auth.js)

   PUBLIC API
   ──────────
   window.createNewPostElement(text, mediaFiles, authorData, isBusinessPost, retweetData)
   window.createSosPostOnFeed(sosData)
   window.createCrisisPostOnFeed(crisisData)
   window._startRealtimeListeners()
   window.renderDashboardNews()
   window.renderSuggestedUsers()
   window._addUrlsToProfileGallery(urls)
   window.setupReelViewerObserver()
   window.openReelViewer(clickedCard)

   SECTION MAP
   ───────────
   §1  Post card builder — createNewPostElement
   §2  SOS post card — createSosPostOnFeed
   §3  Crisis report card — createCrisisPostOnFeed
   §4  Realtime listeners — _startRealtimeListeners (8 collections)
   §5  Dashboard news slider — renderDashboardNews
   §6  Suggested users widget — renderSuggestedUsers
   §7  Profile gallery helper — _addUrlsToProfileGallery
   §8  Reel viewer — setupReelViewerObserver + openReelViewer
   §9  View-count observer

   ============================================================================= */

(function empyreanFeedModule() {
    'use strict';

    if (window._empyreanFeedLoaded) {
        console.warn('[EmpFeed] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanFeedLoaded = true;

    /* Shorthand state accessors */
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState  || window.userState  || {}; }
    function _isGuest() { var s=_S(); return s.isGuest != null ? s.isGuest : window.isGuest; }
    function _isAdmin() { var s=_S(); return s.isAdmin != null ? s.isAdmin : window.isAdmin; }


    /* =========================================================================
       §1  POST CARD BUILDER
       ========================================================================= */

    /**
     * Build and return a fully-rendered .impact-story <div> element.
     * Does NOT insert it into the DOM — caller is responsible for placement.
     *
     * @param {string}      text            — Raw post text (markdown + @mention + #tag)
     * @param {Array}       mediaFiles      — File objects or { _cloudUrl, url, type } objects
     * @param {Object|null} authorData      — { id, fullName, avatar, businessPage? }
     *                                        Defaults to current userState
     * @param {boolean}     isBusinessPost  — If true, uses business page avatar/name
     * @param {Object|null} retweetData     — { retweeterName } if this is a retweet
     * @returns {HTMLElement}
     */
    function createNewPostElement(text, mediaFiles, authorData, isBusinessPost, retweetData) {
        isBusinessPost = isBusinessPost || false;
        retweetData    = retweetData    || null;

        const us     = _us();
        const author = authorData || us;

        const avatar = isBusinessPost
            ? (author.businessPage ? author.businessPage.profilePhoto
                : 'https://ui-avatars.com/api/?name=Business&background=5B0EA6&color=fff&size=150')
            : (author.avatar || author.logo
                || ('https://ui-avatars.com/api/?name='
                    + encodeURIComponent(author.fullName || 'U')
                    + '&background=5B0EA6&color=fff&size=150'));

        const name   = isBusinessPost
            ? (author.businessPage ? author.businessPage.name : 'Business Page')
            : (author.fullName || author.name || 'User');

        /* ── Text processing ── */
        const preprocessed = (text || '')
            .replace(/==(.*?)==/g,
                '<mark style="background:rgba(245,197,24,0.3);padding:1px 4px;border-radius:3px;">$1</mark>')
            .replace(/__(.*?)__/g, '<u>$1</u>');

        const ytResult = (typeof window.handleYoutubeEmbed === 'function')
            ? window.handleYoutubeEmbed(preprocessed)
            : { html: '<p>' + (typeof window.formatWhatsAppText === 'function'
                ? window.formatWhatsAppText(preprocessed) : preprocessed) + '</p>', found: false };

        const formattedText = ytResult.html;
        const youtubeFound  = ytResult.found;

        /* ── Read-more truncation ── */
        function _withReadMore(html) {
            const plain = html.replace(/<[^>]*>/g, '');
            if (plain.length <= 280) return html;
            let cutIdx = 0, cnt = 0, inTag = false;
            for (let ci = 0; ci < html.length && cnt < 280; ci++) {
                if (html[ci] === '<') inTag = true;
                if (!inTag) cnt++;
                if (html[ci] === '>') inTag = false;
                cutIdx = ci;
            }
            const preview = html.substring(0, cutIdx + 1);
            const rest    = html.substring(cutIdx + 1);
            return preview
                + '<span class="post-text-overflow">…</span>'
                + '<span class="post-text-rest" style="display:none;">' + rest + '</span><br>'
                + '<a href="#" class="post-read-more" style="font-size:0.82rem;font-weight:700;'
                + 'color:var(--secondary);text-decoration:none;display:inline-block;margin-top:4px;">Read more ▼</a>'
                + '<a href="#" class="post-read-less" style="font-size:0.82rem;font-weight:700;'
                + 'color:var(--secondary);text-decoration:none;display:none;margin-top:4px;">Show less ▲</a>';
        }

        /* ── Media HTML ── */
        let mediaHTML = '';
        if (mediaFiles && mediaFiles.length > 0) {
            const mc = mediaFiles.length;
            const ml = mc === 1 ? 'solo' : mc === 2 ? 'duo' : mc === 3 ? 'trio' : 'grid';
            mediaHTML = '<div class="story-media-container" data-count="' + mc + '" data-layout="' + ml + '">';
            mediaFiles.forEach(function (file, mi) {
                let url, mimeType;
                if (typeof file === 'string') {
                    url = file;
                    mimeType = (/\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(file) || /\/video\/upload\//i.test(file))
                        ? 'video/' : 'image/';
                } else if (file && file._cloudUrl) {
                    url = file._cloudUrl; mimeType = file.type || '';
                } else if (file && file.url) {
                    url = file.url; mimeType = file.type || '';
                } else if (file instanceof File) {
                    url = URL.createObjectURL(file); mimeType = file.type || '';
                } else { return; }
                if (!url || url.startsWith('blob:')) return;

                const isVid = mimeType.startsWith('video/')
                    || /\/video\/upload\//i.test(url)
                    || /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(url);

                mediaHTML += '<div class="story-media-item" data-index="' + mi + '">';
                if (isVid) {
                    mediaHTML += '<video src="' + url + '" class="story-video" controls preload="metadata"'
                        + ' loading="lazy" playsinline onerror="this.closest(\'.story-media-item\').style.display=\'none\'"></video>';
                } else {
                    mediaHTML += '<img src="' + url + '" class="story-main-image" alt="Post media"'
                        + ' loading="lazy" onerror="this.closest(\'.story-media-item\').style.display=\'none\'">';
                }
                mediaHTML += '</div>';
            });
            mediaHTML += '</div>';
        }

        const retweetHeaderHTML = retweetData
            ? '<div class="retweet-header"><i class="fas fa-retweet"></i> '
                + _esc(retweetData.retweeterName) + ' Retweeted</div>'
            : '';

        const postId = 'post-' + Date.now();
        const ts = new Date().toLocaleString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const showOpts = (author.id === us.id || _isAdmin()) ? 'block' : 'none';

        const el = document.createElement('div');
        el.className     = 'impact-story';
        el.dataset.postId = postId;
        el.dataset.userId = author.id;
        el.innerHTML =
            retweetHeaderHTML
            + '<div class="story-header">'
            + '<div class="avatar-placeholder square" style="' + (isBusinessPost ? 'border-radius:8px;' : '') + '">'
            + '<img src="' + _attr(avatar) + '" alt="' + _attr(name) + '" loading="lazy"></div>'
            + '<div class="story-user-info"><strong>' + _esc(name) + '</strong><span>' + ts + '</span></div>'
            + '<div class="post-options" style="display:' + showOpts + ';">'
            + '<button class="options-btn"><i class="fas fa-ellipsis-h"></i></button>'
            + '<div class="options-menu">'
            + '<a href="#" class="edit-post-btn"><i class="fas fa-edit"></i> Edit</a>'
            + '<a href="#" class="delete-post-btn"><i class="fas fa-trash"></i> Delete</a>'
            + '<a href="#" class="promote-post-btn"><i class="fas fa-rocket"></i> Promote</a>'
            + '</div></div></div>'
            + (!youtubeFound ? mediaHTML : '')
            + '<div class="story-content">' + _withReadMore(formattedText) + '</div>'
            + '<div class="story-actions">'
            + '<a class="action-btn like-btn" title="Like"><i class="far fa-heart"></i><span class="like-count">0</span></a>'
            + '<a class="action-btn comment-btn" title="Comment"><i class="far fa-comment"></i><span class="comment-count">0</span></a>'
            + '<a class="action-btn retweet-btn" title="Retweet"><i class="fas fa-retweet"></i><span class="retweet-count">0</span></a>'
            + '<a class="action-btn quote-btn" title="Quote" style="cursor:pointer;"><i class="fas fa-quote-right"></i></a>'
            + '<a class="action-btn share-btn" title="Share"><i class="fas fa-share"></i></a>'
            + '<a class="action-btn download-media-btn" title="Download" style="cursor:pointer;"><i class="fas fa-download"></i></a>'
            + '<span class="action-btn view-count-display" style="color:var(--text-muted);font-size:0.72rem;'
            + 'pointer-events:none;display:flex;align-items:center;gap:3px;" title="Views">'
            + '<i class="fas fa-eye"></i><span class="view-count">0</span></span>'
            + '<span class="sponsored-badge" style="display:none;">Sponsored</span>'
            + '</div>'
            + '<div class="comment-section"><div class="comment-list"></div>'
            + '<form class="comment-form" novalidate>'
            + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
            + '<button type="submit"><i class="fas fa-paper-plane"></i></button>'
            + '</form></div>';

        return el;
    }
    window.createNewPostElement = createNewPostElement;


    /* =========================================================================
       §2  SOS POST CARD
       ========================================================================= */

    /**
     * Build and prepend an approved SOS post into #feed-container.
     * @param {Object} sosData — Firestore sos_queue document
     */
    function createSosPostOnFeed(sosData) {
        const fc = document.getElementById('feed-container');
        if (!fc) return;

        const el = document.createElement('div');
        el.className      = 'impact-story sos-request';
        el.dataset.postId  = sosData.id;
        el.dataset.userId  = sosData.userId;
        el.dataset.amount  = sosData.amount;
        el.dataset.currency= sosData.currency;
        el.dataset.username= sosData.username;

        let mediaHTML = '';
        if (sosData.media && sosData.media.length > 0) {
            const mc = sosData.media.length;
            const ml = mc === 1 ? 'solo' : mc === 2 ? 'duo' : mc === 3 ? 'trio' : 'grid';
            mediaHTML = '<div class="story-media-container" data-count="' + mc + '" data-layout="' + ml + '">';
            sosData.media.forEach(function (mi, idx) {
                const isVid = (mi.type && mi.type.startsWith('video/'))
                    || (mi.url && /\.(mp4|webm|ogg|mov)(\?|$)/i.test(mi.url));
                mediaHTML += '<div class="story-media-item" data-index="' + idx + '">';
                if (isVid) {
                    mediaHTML += '<video src="' + mi.url + '" class="story-video" controls preload="metadata" playsinline></video>';
                } else {
                    mediaHTML += '<img src="' + mi.url + '" class="story-main-image" alt="SOS Evidence" loading="lazy">';
                }
                mediaHTML += '</div>';
            });
            mediaHTML += '</div>';
        }

        let amountStr = sosData.amount;
        try {
            const fmt = new Intl.NumberFormat('en-US', {
                style: 'currency', currency: sosData.currency || 'USD',
                minimumFractionDigits: (sosData.currency === 'EMPY' || sosData.currency === 'USDT') ? 2 : 0
            });
            amountStr = fmt.format(parseFloat(sosData.amount));
        } catch (e) {}

        const storyText = (typeof window.formatWhatsAppText === 'function')
            ? window.formatWhatsAppText(sosData.story || '') : (sosData.story || '');
        const ts = new Date().toLocaleString('en-GB', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        el.innerHTML =
            '<div class="story-header">'
            + '<div class="avatar-placeholder square"><img src="' + _attr(sosData.avatar) + '" alt="' + _attr(sosData.username) + '" loading="lazy"></div>'
            + '<div class="story-user-info"><strong>SOS: ' + _esc(sosData.title) + '</strong>'
            + '<span>Request by ' + _esc(sosData.username) + ' · ' + ts + '</span></div>'
            + '<span class="sos-badge">SOS</span>'
            + '</div>'
            + '<div class="story-content">'
            + '<p>' + storyText + '</p>'
            + '<p>I urgently need <b class="amount-needed">' + amountStr + '</b> to cover my needs.</p>'
            + '</div>'
            + mediaHTML
            + '<div class="story-actions">'
            + '<a class="action-btn like-btn"><i class="far fa-heart"></i><span class="like-count">0</span></a>'
            + '<a class="action-btn comment-btn"><i class="far fa-comment"></i><span class="comment-count">0</span></a>'
            + '<a class="action-btn retweet-btn"><i class="fas fa-retweet"></i><span class="retweet-count">0</span></a>'
            + '<a class="action-btn share-btn"><i class="fas fa-share"></i></a>'
            + '<a class="action-btn download-media-btn"><i class="fas fa-download"></i></a>'
            + '<span class="action-btn view-count-display" style="color:var(--text-muted);font-size:0.72rem;pointer-events:none;display:flex;align-items:center;gap:3px;margin-left:auto;">'
            + '<i class="fas fa-eye"></i><span class="view-count">0</span></span>'
            + '</div>'
            + '<div style="padding:10px 16px 14px;">'
            + '<button class="gift-button sos-button help-now-btn"'
            + ' style="width:100%;padding:12px;font-size:0.95rem;font-weight:700;border-radius:12px;'
            + 'background:linear-gradient(135deg,#EF4444,#B91C1C);color:white;border:none;cursor:pointer;'
            + 'display:flex;align-items:center;justify-content:center;gap:8px;">'
            + '<i class="fas fa-hand-holding-heart"></i> Donate Now — Help ' + _esc(sosData.username)
            + '</button></div>'
            + '<div class="comment-section"><div class="comment-list"></div>'
            + '<form class="comment-form" novalidate>'
            + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
            + '<button type="submit"><i class="fas fa-paper-plane"></i></button>'
            + '</form></div>';

        fc.prepend(el);
    }
    window.createSosPostOnFeed = createSosPostOnFeed;


    /* =========================================================================
       §3  CRISIS REPORT CARD
       ========================================================================= */

    /**
     * Build and prepend a crisis report into #feed-container.
     * @param {Object} crisisData — Firestore crisis_reports document
     */
    function createCrisisPostOnFeed(crisisData) {
        const fc = document.getElementById('feed-container');
        if (!fc) return;

        const us = _us();
        let mediaHTML = '';
        if (crisisData.media && crisisData.media.length > 0) {
            mediaHTML = '<div class="story-media-container" data-count="' + crisisData.media.length + '">';
            crisisData.media.forEach(function (mi) {
                if (!mi || !mi.url || mi.url.startsWith('blob:')) return;
                const isVid = (mi.type || '').startsWith('video/')
                    || /\/video\/upload\//i.test(mi.url)
                    || /\.(mp4|webm|mov)(\?|$)/i.test(mi.url);
                mediaHTML += '<div class="story-media-item">';
                if (isVid) {
                    mediaHTML += '<video src="' + mi.url + '" class="story-video" controls preload="metadata" playsinline></video>';
                } else {
                    mediaHTML += '<img src="' + mi.url + '" class="story-main-image" alt="Crisis Evidence" loading="lazy">';
                }
                mediaHTML += '</div>';
            });
            mediaHTML += '</div>';
        }

        const descHtml = (typeof window.formatWhatsAppText === 'function')
            ? window.formatWhatsAppText(crisisData.description || '') : (crisisData.description || '');
        const locationHtml = '<p style="font-size:0.9rem;color:#666;margin-top:10px;">'
            + '<i class="fas fa-map-marker-alt"></i> <strong>Location:</strong> '
            + _esc(crisisData.location || 'Unknown') + '</p>';

        const canDelete = (crisisData.userId === us.id || _isAdmin());
        const ts = crisisData.createdAt
            ? new Date(crisisData.createdAt).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : 'Recently';

        const el = document.createElement('div');
        el.className       = 'impact-story crisis-report';
        el.dataset.postId   = crisisData.id || ('crisis-' + Date.now());
        el.dataset.userId   = crisisData.userId;

        el.innerHTML =
            '<div class="story-header">'
            + '<div class="avatar-placeholder square"><img src="' + _attr(crisisData.avatar) + '" alt="' + _attr(crisisData.username) + '" loading="lazy"></div>'
            + '<div class="story-user-info">'
            + '<strong>Crisis Report: ' + _esc(crisisData.type) + '</strong>'
            + '<span>Reported by ' + _esc(crisisData.username) + ' · ' + ts + '</span></div>'
            + '<div class="post-options"><button class="options-btn"><i class="fas fa-ellipsis-h"></i></button>'
            + '<div class="options-menu">'
            + '<a href="#" class="promote-post-btn"><i class="fas fa-rocket"></i> Promote</a>'
            + (canDelete ? '<a href="#" class="delete-post-btn" style="color:#e53935;"><i class="fas fa-trash"></i> Delete</a>' : '')
            + '</div></div></div>'
            + '<div class="story-content"><p>' + descHtml + '</p>' + locationHtml + '</div>'
            + mediaHTML
            + '<div class="story-actions">'
            + '<a class="action-btn like-btn"><i class="far fa-heart"></i><span class="like-count">0</span></a>'
            + '<a class="action-btn comment-btn"><i class="far fa-comment"></i><span class="comment-count">0</span></a>'
            + '<a class="action-btn retweet-btn"><i class="fas fa-retweet"></i><span class="retweet-count">0</span></a>'
            + '<a class="action-btn share-btn"><i class="fas fa-share"></i></a>'
            + '<span class="action-btn view-count-display" style="color:var(--text-muted);font-size:0.72rem;'
            + 'pointer-events:none;display:flex;align-items:center;gap:3px;margin-left:auto;">'
            + '<i class="fas fa-eye"></i><span class="view-count">0</span></span>'
            + '</div>'
            + '<div class="comment-section"><div class="comment-list"></div>'
            + '<form class="comment-form" novalidate>'
            + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
            + '<button type="submit"><i class="fas fa-paper-plane"></i></button>'
            + '</form></div>';

        fc.prepend(el);
    }
    window.createCrisisPostOnFeed = createCrisisPostOnFeed;


    /* =========================================================================
       §4  REAL-TIME FIRESTORE LISTENERS
       ========================================================================= */

    /**
     * Start all 8 real-time Firestore onSnapshot listeners.
     * Requires Firebase to be loaded and a valid session to exist.
     * Guards against duplicate registrations using window._*Listener handles.
     * Called by: app-auth.js onAuthStateChanged, login handler, online-resume handler.
     */
    window._startRealtimeListeners = function () {
        var db = window.fbDb;

        /* ── Session validation ── */
        var _uid    = (window.fbAuth && window.fbAuth.currentUser && window.fbAuth.currentUser.uid) || null;
        var _lsUser = window.userState && window.userState.id
            && window.userState.id !== 'user-main' && !window.isGuest;
        var hasValidSession = !!_uid || !!_lsUser;

        if (!window._firebaseLoaded || !db) {
            console.warn('[Listeners] Firebase not ready — will retry.');
            if (typeof window._scheduleListenerRetry === 'function') window._scheduleListenerRetry();
            return;
        }
        if (!hasValidSession) {
            try {
                var _se = localStorage.getItem('empyrean_session_email');
                if (_se && window.userState && !window.isGuest) hasValidSession = true;
            } catch (e) {}
        }
        if (!hasValidSession) {
            console.warn('[Listeners] No authenticated user — will retry.');
            if (typeof window._scheduleListenerRetry === 'function') window._scheduleListenerRetry();
            return;
        }

        var uid = _uid || (window.userState && window.userState.id) || 'local';
        console.log('[Listeners] Starting real-time listeners for uid:', uid);

        function _unsub(handle) { try { if (typeof handle === 'function') handle(); } catch (e) {} }

        /* Clear Firebase pre-stubs on first real init */
        if (window._firstRealFirebaseInit) {
            window._firstRealFirebaseInit = false;
            ['_postsListener','_newsListener','_mktListener','_reelsListener',
             '_sosListener','_crisisListener','_announcementsListener','_usersListener']
                .forEach(function (k) {
                    var h = window[k];
                    if (h && typeof h === 'function') {
                        try { h(); } catch (e) {}
                        window[k] = null;
                    }
                });
        }

        var us    = _us();
        var mu    = (_S().mockUsers)    || window.mockUsers    || {};
        var ru    = (_S().registeredUsers) || window.registeredUsers || {};

        /* ── 1. POSTS ─────────────────────────────────────────────────────── */
        if (!window._postsListener) {
            var _postsInitialBatch = true;
            window._postsListener = db.collection('posts')
                .orderBy('createdAt', 'desc').limit(40)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    var fc = document.getElementById('feed-container');
                    var es = document.getElementById('feed-empty-state');
                    snap.docChanges().forEach(function (change) {
                        var post = change.doc.data();
                        if (!post || !post.id) return;

                        if (change.type === 'added') {
                            var alreadyInFeed = !!(fc && fc.querySelector('[data-post-id="' + post.id + '"]'));
                            var media = (post.media || [])
                                .filter(function (u) { return u && !u.startsWith('blob:'); })
                                .map(function (u) {
                                    return {
                                        _cloudUrl: u, url: u,
                                        type: (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(u) || /\/video\/upload\//i.test(u))
                                            ? 'video/mp4' : 'image/jpeg'
                                    };
                                });
                            var av = post.avatar
                                || ('https://ui-avatars.com/api/?name='
                                    + encodeURIComponent(post.username || 'U')
                                    + '&background=5B0EA6&color=fff&size=150');
                            var el = createNewPostElement(
                                post.text || '', media,
                                { id: post.userId, fullName: post.username || 'User', avatar: av }
                            );
                            el.dataset.postId = post.id;
                            el.dataset.userId = post.userId;

                            /* Restore server timestamp */
                            var tsEl = el.querySelector('.story-user-info span');
                            if (tsEl && post.createdAt) {
                                tsEl.textContent = new Date(post.createdAt).toLocaleString('en-GB', {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                });
                            }
                            /* Restore persisted like count */
                            if (post.likes > 0) {
                                var lc = el.querySelector('.like-count');
                                if (lc) lc.textContent = new Intl.NumberFormat().format(post.likes);
                            }

                            if (fc && !alreadyInFeed) {
                                if (_postsInitialBatch) { fc.appendChild(el); } else { fc.prepend(el); }
                                if (es) es.style.display = 'none';
                            }

                            /* Mirror own posts to profile feeds */
                            if (post.userId === us.id && !post.isRetweet) {
                                ['profile-dash-feed', 'profile-posts-feed'].forEach(function (fid) {
                                    var pf = document.getElementById(fid);
                                    if (pf && !pf.querySelector('[data-post-id="' + post.id + '"]')) {
                                        var clone = el.cloneNode(true);
                                        if (_postsInitialBatch) { pf.appendChild(clone); } else { pf.prepend(clone); }
                                    }
                                });
                                if (post.media && post.media.length) {
                                    _addUrlsToProfileGallery(
                                        post.media.filter(function (u) { return u && !u.startsWith('blob:'); })
                                    );
                                }
                            }

                        } else if (change.type === 'removed') {
                            ['feed-container', 'profile-dash-feed', 'profile-posts-feed'].forEach(function (fid) {
                                var f2 = document.getElementById(fid);
                                if (f2) { var e2 = f2.querySelector('[data-post-id="' + post.id + '"]'); if (e2) e2.remove(); }
                            });
                        }
                    });
                    _postsInitialBatch = false;
                }, function (err) {
                    console.error('[Listener:posts]', err.code, err.message);
                    window._postsListener = null;
                });
            console.log('[Firestore] ✅ posts listener active');
        }

        /* ── 2. NEWS ──────────────────────────────────────────────────────── */
        if (!window._newsListener) {
            window._newsListener = db.collection('news_posts')
                .orderBy('createdAt', 'desc').limit(20)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    var nl = document.getElementById('news-list-container');
                    function _syncEmpty() {
                        var es = document.getElementById('news-empty-state');
                        if (es && nl) es.style.display = nl.querySelector('.news-list-item') ? 'none' : 'block';
                    }
                    snap.docChanges().forEach(function (change) {
                        var n = change.doc.data();
                        if (!n || !n.id) return;
                        if (change.type === 'removed') {
                            if (nl) { var r = nl.querySelector('[data-post-id="' + n.id + '"]'); if (r) r.remove(); }
                            var tr = document.querySelector('#admin-news-table-body tr[data-post-id="' + n.id + '"]');
                            if (tr) tr.remove();
                            _syncEmpty();
                            if (typeof window.renderDashboardNews === 'function') window.renderDashboardNews();
                            return;
                        }
                        if (change.type === 'added') {
                            if (nl && nl.querySelector('[data-post-id="' + n.id + '"]')) return;
                            var isVid = n.mediaUrl && (
                                (n.mediaType || '').startsWith('video/')
                                || /\/video\/upload\//i.test(n.mediaUrl)
                                || /\.(mp4|webm|mov)(\?|$)/i.test(n.mediaUrl)
                            );
                            var mh = n.mediaUrl
                                ? ('<div class="news-item-image">'
                                    + (isVid
                                        ? '<video src="' + n.mediaUrl + '" controls playsinline style="width:100%;height:100%;object-fit:cover;"></video>'
                                        : '<img src="' + n.mediaUrl + '" loading="lazy">')
                                    + '</div>')
                                : '';
                            var ownerOpts = (n.userId === us.id || _isAdmin())
                                ? '<div class="post-options" style="position:absolute;top:8px;right:8px;">'
                                + '<button class="options-btn"><i class="fas fa-ellipsis-h"></i></button>'
                                + '<div class="options-menu">'
                                + '<a href="#" class="edit-post-btn"><i class="fas fa-edit"></i> Edit</a>'
                                + '<a href="#" class="delete-news-btn" data-news-id="' + (n.id || '') + '" style="color:#e53935;">'
                                + '<i class="fas fa-trash"></i> Delete</a></div></div>'
                                : '';
                            var ni = document.createElement('div');
                            ni.className       = 'news-list-item';
                            ni.dataset.postId   = n.id;
                            ni.dataset.userId   = n.userId || '';
                            ni.style.position   = 'relative';
                            ni.innerHTML = ownerOpts + mh
                                + '<div class="news-item-content-wrapper"><div class="news-item-content">'
                                + '<h4>' + _esc(n.title || '') + '</h4>'
                                + '<span class="news-meta"><i class="fas fa-calendar-alt"></i> '
                                + (n.createdAt ? new Date(n.createdAt).toLocaleDateString() : 'Recently')
                                + '</span><p>' + _esc(n.content || '') + '</p></div>'
                                + '<div class="story-actions" style="margin-top:8px;">'
                                + '<a class="action-btn like-btn"><i class="far fa-heart"></i><span class="like-count">0</span></a>'
                                + '<a class="action-btn comment-btn"><i class="far fa-comment"></i><span class="comment-count">0</span></a>'
                                + '<a class="action-btn retweet-btn"><i class="fas fa-retweet"></i><span class="retweet-count">0</span></a>'
                                + '<a class="action-btn share-btn"><i class="fas fa-share"></i></a>'
                                + '<a class="action-btn download-media-btn"><i class="fas fa-download"></i></a>'
                                + '<span class="action-btn view-count-display" style="margin-left:auto;color:var(--text-muted);font-size:0.72rem;pointer-events:none;">'
                                + '<i class="fas fa-eye"></i><span class="view-count">0</span></span></div>'
                                + '<div class="comment-section"><div class="comment-list"></div>'
                                + '<form class="comment-form" novalidate>'
                                + '<input type="text" name="comment-text" placeholder="Add a comment..." required>'
                                + '<button type="submit"><i class="fas fa-paper-plane"></i></button>'
                                + '</form></div></div>';

                            var isNew = n.createdAt && (Date.now() - new Date(n.createdAt).getTime() < 30000);
                            if (nl) { if (isNew) { nl.prepend(ni); } else { nl.appendChild(ni); } }
                            _syncEmpty();
                            if (typeof window.renderDashboardNews === 'function') window.renderDashboardNews();
                        }
                    });
                }, function (err) {
                    console.error('[Listener:news]', err.code, err.message);
                    window._newsListener = null;
                });
            console.log('[Firestore] ✅ news_posts listener active');
        }

        /* ── 3. MARKETPLACE ───────────────────────────────────────────────── */
        if (!window._mktListener) {
            window._mktListener = db.collection('marketplace_listings')
                .orderBy('createdAt', 'desc').limit(40)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    var grid      = document.getElementById('property-grid-container');
                    var mktSlider = document.getElementById('dashboard-market-slider');
                    snap.docChanges().forEach(function (change) {
                        var item = change.doc.data();
                        if (!item || !item.id) return;
                        if (change.type === 'added') {
                            var firstUrl = item.media && item.media[0] ? item.media[0] : '';
                            var isVid = (item.mediaTypes && (item.mediaTypes[0] || '').startsWith('video/'))
                                || /\/video\/upload\//i.test(firstUrl)
                                || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(firstUrl);
                            var syms = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: '₵', EMPY: 'EMPY ', USDT: 'USDT ' };
                            var sym      = syms[item.currency] || '$';
                            var priceStr = sym + parseFloat(item.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
                            var isNew    = item.createdAt && (Date.now() - new Date(item.createdAt).getTime() < 30000);

                            if (grid && !grid.querySelector('[data-id="' + item.id + '"]')) {
                                var allUrls = item.media || [];
                                var mktMediaHTML = '';
                                if (allUrls.length === 0) {
                                    mktMediaHTML = '<div style="width:100%;height:200px;background:linear-gradient(135deg,#1B2B8B,#0A0E27);'
                                        + 'display:flex;align-items:center;justify-content:center;">'
                                        + '<i class="fas fa-image" style="font-size:2rem;color:rgba(255,255,255,0.3);"></i></div>';
                                } else if (allUrls.length === 1) {
                                    mktMediaHTML = isVid
                                        ? '<video src="' + firstUrl + '" autoplay loop muted playsinline controls style="width:100%;height:200px;object-fit:cover;display:block;"></video>'
                                        : '<img src="' + firstUrl + '" alt="' + _esc(item.name || '') + '" loading="lazy" style="width:100%;height:200px;object-fit:cover;display:block;">';
                                } else {
                                    var cols = allUrls.length === 2 ? '1fr 1fr' : allUrls.length === 3 ? '2fr 1fr' : '1fr 1fr';
                                    mktMediaHTML = '<div style="display:grid;grid-template-columns:' + cols + ';gap:3px;height:200px;overflow:hidden;">';
                                    allUrls.slice(0, 4).forEach(function (mu, mi) {
                                        var isV = /\.(mp4|webm|mov)(\?|$)/i.test(mu) || /\/video\/upload\//i.test(mu);
                                        var extra = allUrls.length === 3 && mi === 0 ? 'grid-row:1/3;' : '';
                                        mktMediaHTML += isV
                                            ? '<video src="' + mu + '" controls muted playsinline style="width:100%;height:100%;object-fit:cover;' + extra + '"></video>'
                                            : '<img src="' + mu + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;' + extra + '">';
                                    });
                                    if (allUrls.length > 4) {
                                        mktMediaHTML += '<div style="display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);color:white;font-size:1.2rem;font-weight:800;">+'
                                            + (allUrls.length - 4) + '</div>';
                                    }
                                    mktMediaHTML += '</div>';
                                }

                                var card = document.createElement('div');
                                card.className = 'property-card';
                                card.dataset.id      = item.id;
                                card.dataset.price   = item.price;
                                card.dataset.name    = item.name || '';
                                card.dataset.displayCurrency = item.currency;
                                card.dataset.salesType = item.salesType || '';
                                card.dataset.media   = JSON.stringify(item.media || []);
                                card.dataset.sellerId = item.sellerId || '';
                                card.innerHTML = mktMediaHTML
                                    + '<div class="property-info"><h4>' + _esc(item.name || '') + '</h4>'
                                    + '<p><i class="fas fa-map-marker-alt"></i> ' + _esc(item.location || '') + '</p>'
                                    + '<div style="font-weight:700;color:var(--accent-color);font-size:1rem;">' + priceStr + '</div></div>'
                                    + '<div class="property-seller-info"><strong>@' + _esc(item.sellerName || item.username || 'Seller') + '</strong>'
                                    + (item.salesType === 'escrow'
                                        ? '<i class="fas fa-check-circle verified-badge-small" title="Escrow Protected"></i>'
                                        : '<i class="fas fa-exclamation-circle unverified-badge-small" title="Direct Sales"></i>')
                                    + '<span style="font-size:0.72rem;color:var(--text-muted);">'
                                    + (item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently')
                                    + '</span></div>'
                                    + (item.salesType === 'direct'
                                        ? '<div class="direct-trade-warning" style="display:block;"><p><strong><i class="fas fa-exclamation-triangle"></i> Direct Sales:</strong> Please conduct due diligence.</p></div>'
                                        : '')
                                    + '<div class="direct-contact-info" style="display:none;"></div>'
                                    + '<div class="property-actions">'
                                    + (item.salesType === 'escrow'
                                        ? '<button class="btn btn-accent add-to-cart-btn"><i class="fas fa-cart-plus"></i> Add to Cart</button>'
                                        : '<button class="btn btn-danger contact-seller-btn"><i class="fas fa-phone"></i> Contact Seller</button>')
                                    + '<button class="btn promote-post-btn"><i class="fas fa-rocket"></i> Promote</button>'
                                    + ((item.sellerId === us.id || _isAdmin())
                                        ? '<button class="btn edit-post-btn" style="background:rgba(27,43,139,0.08);color:var(--secondary);border:1px solid rgba(27,43,139,0.2);"><i class="fas fa-edit"></i> Edit</button>'
                                        + '<button class="btn delete-post-btn" style="background:rgba(229,57,53,0.08);color:#e53935;border:1px solid rgba(229,57,53,0.2);"><i class="fas fa-trash"></i> Delete</button>'
                                        : '')
                                    + '</div>';

                                if (isNew) { grid.prepend(card); } else { grid.appendChild(card); }

                                /* Dashboard slider card */
                                if (mktSlider && !mktSlider.querySelector('[data-id="' + item.id + '"]')) {
                                    var dc = document.createElement('div');
                                    dc.className = 'dashboard-market-card';
                                    dc.dataset.id = item.id;
                                    dc.dataset.navTarget = 'marketplace';
                                    dc.innerHTML = (firstUrl
                                        ? (isVid
                                            ? '<video src="' + firstUrl + '" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>'
                                            : '<img src="' + firstUrl + '" alt="' + _esc(item.name || '') + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;">')
                                        : '')
                                        + '<div class="dashboard-market-card-info"><h5>' + _esc(item.name || '') + '</h5><p>' + priceStr + '</p></div>';
                                    if (isNew) { mktSlider.prepend(dc); } else { mktSlider.appendChild(dc); }
                                }
                                if (isNew && window.pushNotification) {
                                    window.pushNotification(
                                        '🛒 New listing: ' + (item.name || 'item') + ' by @' + (item.sellerName || 'seller'),
                                        'new_listing'
                                    );
                                }
                            }
                        } else if (change.type === 'removed') {
                            var e2 = grid && grid.querySelector('[data-id="' + item.id + '"]');
                            if (e2) e2.remove();
                        }
                    });
                }, function (err) {
                    console.error('[Listener:mkt]', err.code, err.message);
                    window._mktListener = null;
                });
            console.log('[Firestore] ✅ marketplace_listings listener active');
        }

        /* ── 4. REELS ─────────────────────────────────────────────────────── */
        if (!window._reelsListener) {
            window._reelsListener = db.collection('reels')
                .orderBy('createdAt', 'desc').limit(30)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var reel = change.doc.data();
                        if (!reel || !reel.id || !reel.videoUrl || reel.videoUrl.startsWith('blob:')) return;
                        if (change.type !== 'added') return;

                        var isNew = reel.createdAt && (Date.now() - new Date(reel.createdAt).getTime() < 30000);

                        /* Dashboard slider */
                        var slider  = document.getElementById('dashboard-reels-slider');
                        var reelCnt = document.getElementById('dashboard-reels-container');
                        if (slider) {
                            if (reelCnt) reelCnt.style.display = 'block';
                            var existing = slider.querySelector('[data-reel-id="' + reel.id + '"]');
                            if (existing) {
                                var ev = existing.querySelector('video');
                                if (ev) ev.src = reel.videoUrl;
                                existing.dataset.reelId = reel.id;
                            } else {
                                var dc2 = document.createElement('div');
                                dc2.className = 'dashboard-reel-card';
                                dc2.dataset.navTarget = 'reels';
                                dc2.dataset.reelId    = reel.id;
                                dc2.innerHTML =
                                    '<video src="' + reel.videoUrl + '" loop muted autoplay playsinline'
                                    + ' style="width:100%;height:100%;object-fit:cover;display:block;">'
                                    + '<source src="' + reel.videoUrl + '" type="video/mp4"></video>'
                                    + '<div class="reel-content"><div class="reel-user-info">'
                                    + '<div class="avatar-placeholder square" style="width:35px;height:35px;">'
                                    + '<img src="' + _attr(reel.avatar || '') + '" alt="@' + _attr(reel.username || '') + '"></div>'
                                    + '<span>@' + _esc(reel.username || 'user') + '</span></div>'
                                    + '<p>' + _esc(reel.caption || '') + '</p></div>';
                                if (isNew) { slider.prepend(dc2); } else { slider.appendChild(dc2); }
                            }
                        }

                        /* Main reels grid */
                        var rg = document.getElementById('reels-grid-container');
                        if (rg) {
                            var existCard = rg.querySelector('[data-post-id="' + reel.id + '"]');
                            if (existCard) {
                                var ev2 = existCard.querySelector('video');
                                if (ev2 && reel.videoUrl) ev2.src = reel.videoUrl;
                                existCard.dataset.videoUrl = reel.videoUrl;
                            } else {
                                var rc = document.createElement('div');
                                rc.className        = 'reel-card';
                                rc.dataset.postId   = reel.id;
                                rc.dataset.videoUrl = reel.videoUrl;
                                rc.dataset.userId   = reel.userId || '';
                                rc.innerHTML =
                                    '<video src="' + reel.videoUrl + '" loop muted playsinline preload="metadata"'
                                    + ' style="width:100%;height:100%;object-fit:cover;display:block;"></video>'
                                    + '<div class="reel-content" style="position:absolute;bottom:0;left:0;right:0;'
                                    + 'padding:12px;background:linear-gradient(transparent,rgba(0,0,0,0.8));color:white;">'
                                    + '<div class="reel-user-info" style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                                    + '<div class="avatar-placeholder" style="width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;">'
                                    + '<img src="' + _attr(reel.avatar || '') + '"></div>'
                                    + '<span style="font-weight:700;font-size:0.85rem;">@' + _esc(reel.username || 'user') + '</span></div>'
                                    + '<p style="font-size:0.82rem;opacity:0.9;margin:0;">' + _esc(reel.caption || '') + '</p></div>';

                                var rv = rc.querySelector('video');
                                if (rv) {
                                    rc.addEventListener('mouseenter', function () { rv.play().catch(function () {}); });
                                    rc.addEventListener('mouseleave', function () { rv.pause(); rv.currentTime = 0; });
                                }

                                if (reel.userId === us.id || _isAdmin()) {
                                    var opts = document.createElement('div');
                                    opts.style.cssText = 'position:absolute;top:8px;right:8px;z-index:10;';
                                    opts.innerHTML =
                                        '<button class="options-btn" style="background:rgba(0,0,0,0.55);border:none;color:white;'
                                        + 'border-radius:50%;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;">'
                                        + '<i class="fas fa-ellipsis-h" style="font-size:0.75rem;pointer-events:none;"></i></button>'
                                        + '<div class="options-menu" style="position:absolute;top:34px;right:0;background:white;border-radius:10px;'
                                        + 'box-shadow:0 4px 20px rgba(0,0,0,0.2);min-width:130px;z-index:100;overflow:hidden;">'
                                        + '<a href="#" class="edit-post-btn" style="display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:0.82rem;color:var(--secondary);font-weight:600;text-decoration:none;"><i class="fas fa-edit"></i> Edit</a>'
                                        + '<a href="#" class="delete-post-btn" style="display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:0.82rem;color:#e53935;font-weight:600;text-decoration:none;"><i class="fas fa-trash"></i> Delete</a>'
                                        + '</div>';
                                    rc.style.position = 'relative';
                                    rc.appendChild(opts);
                                }

                                var reEmpty = document.getElementById('reels-empty-state');
                                if (reEmpty) reEmpty.style.display = 'none';
                                if (isNew) { rg.prepend(rc); } else { rg.appendChild(rc); }
                            }
                        }

                        if (isNew && window.pushNotification) {
                            window.pushNotification('🎬 New reel from @' + (reel.username || 'someone') + '!', 'new_reel');
                        }
                    });
                }, function (err) {
                    console.error('[Listener:reels]', err.code, err.message);
                    window._reelsListener = null;
                    if (err.code !== 'permission-denied') {
                        setTimeout(function () {
                            if (!window._reelsListener && typeof window._startRealtimeListeners === 'function') {
                                window._startRealtimeListeners();
                            }
                        }, 5000);
                    }
                });
            console.log('[Firestore] ✅ reels listener active');
        }

        /* ── 5. SOS QUEUE ─────────────────────────────────────────────────── */
        if (!window._sosListener) {
            window._sosListener = db.collection('sos_queue').limit(30)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var sos = change.doc.data();
                        if (!sos || !sos.id) return;
                        if (change.type === 'added' && sos.status === 'approved') {
                            var fc = document.getElementById('feed-container');
                            if (fc && !fc.querySelector('[data-post-id="' + sos.id + '"]')) {
                                createSosPostOnFeed(sos);
                            }
                        }
                        if (change.type === 'removed') {
                            var el2 = document.querySelector('[data-post-id="' + sos.id + '"]');
                            if (el2) el2.remove();
                        }
                    });
                    /* Repair: inject donate button on any SOS card that is missing it */
                    setTimeout(function () {
                        document.querySelectorAll('.impact-story.sos-request').forEach(function (p) {
                            if (!p.querySelector('.help-now-btn')) {
                                var uname = p.dataset.username || 'this cause';
                                var wrap  = document.createElement('div');
                                wrap.style.cssText = 'padding:10px 16px 14px;';
                                wrap.innerHTML = '<button class="gift-button sos-button help-now-btn" style="width:100%;padding:12px;'
                                    + 'font-size:0.95rem;font-weight:700;border-radius:12px;background:linear-gradient(135deg,#EF4444,#B91C1C);'
                                    + 'color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">'
                                    + '<i class="fas fa-hand-holding-heart"></i> Donate Now — Help ' + _esc(uname) + '</button>';
                                var ac = p.querySelector('.story-actions');
                                if (ac) { p.insertBefore(wrap, ac.nextSibling); } else { p.appendChild(wrap); }
                            }
                        });
                    }, 400);
                }, function (err) {
                    console.error('[Listener:sos]', err.code, err.message);
                    window._sosListener = null;
                });
            console.log('[Firestore] ✅ sos_queue listener active');
        }

        /* ── 6. CRISIS REPORTS ────────────────────────────────────────────── */
        if (!window._crisisListener) {
            window._crisisListener = db.collection('crisis_reports')
                .orderBy('createdAt', 'desc').limit(20)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var cr = change.doc.data();
                        if (!cr) return;
                        cr.id = cr.id || change.doc.id;
                        if (change.type === 'removed') {
                            var fc = document.getElementById('feed-container');
                            if (fc) { var r = fc.querySelector('[data-post-id="' + cr.id + '"]'); if (r) r.remove(); }
                            return;
                        }
                        if (change.type === 'added') {
                            var fc2 = document.getElementById('feed-container');
                            if (!fc2) return;
                            if (fc2.querySelector('[data-post-id="' + cr.id + '"]')) return;
                            createCrisisPostOnFeed(cr);
                        }
                    });
                }, function (err) {
                    console.error('[Listener:crisis]', err.code, err.message);
                    window._crisisListener = null;
                });
            console.log('[Firestore] ✅ crisis_reports listener active');
        }

        /* ── 7. ANNOUNCEMENTS ─────────────────────────────────────────────── */
        if (!window._announcementsListener) {
            window._announcementsListener = db.collection('announcements').limit(10)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var ann = change.doc.data();
                        if (!ann || change.type !== 'added') return;
                        var icons = { announcement: '📢', appreciation: '🏆', update: '🔔', 'sos-thanks': '❤️' };
                        var icon  = icons[ann.type] || '📢';
                        if (window.pushNotification) {
                            window.pushNotification(icon + ' ' + (ann.title || 'Admin Announcement'), 'announcement');
                        }
                    });
                }, function (err) {
                    console.error('[Listener:announcements]', err.code, err.message);
                    window._announcementsListener = null;
                });
            console.log('[Firestore] ✅ announcements listener active');
        }

        /* ── 8. USERS (suggested / follow) ───────────────────────────────── */
        if (!window._usersListener) {
            window._usersListener = db.collection('users').limit(50)
                .onSnapshot(function (snap) {
                    if (!snap) return;
                    snap.docChanges().forEach(function (change) {
                        var u = change.doc.data();
                        if (!u || !u.id || u.id === us.id) return;
                        ['likedPostIds','followedUserIds','retweetedPostIds',
                         'awardedRanks','completedTasks','viewedStatusUserIds'].forEach(function (k) {
                            u[k] = new Set(Array.isArray(u[k]) ? u[k] : []);
                        });
                        if (change.type === 'added' || change.type === 'modified') {
                            mu[u.id] = u;
                            if (u.email) ru[u.email] = u;
                        } else if (change.type === 'removed') {
                            delete mu[u.id];
                        }
                    });
                    if (typeof window.renderSuggestedUsers === 'function') window.renderSuggestedUsers();
                }, function (err) {
                    console.error('[Listener:users]', err.code, err.message);
                    window._usersListener = null;
                });
            console.log('[Firestore] ✅ users listener active');
        }

        console.log('[Firestore] ✅ ALL 8 real-time listeners active — full cross-device sync enabled');

        setTimeout(function () {
            if (typeof window._populateHomeBioCard === 'function') window._populateHomeBioCard();
            if (typeof window.renderSuggestedUsers  === 'function') window.renderSuggestedUsers();
        }, 500);
    };


    /* =========================================================================
       §5  DASHBOARD NEWS SLIDER
       ========================================================================= */

    /**
     * Populate the horizontal dashboard news slider from the current
     * #news-list-container items.  Called after news listener fires.
     */
    function renderDashboardNews() {
        var container = document.getElementById('dashboard-news-container');
        var slider    = document.getElementById('dashboard-news-slider');
        if (!container || !slider) return;

        slider.innerHTML = '';
        var newsItems = Array.from(document.querySelectorAll('#news .news-list-item'));

        newsItems.slice(0, 8).forEach(function (item) {
            var titleEl = item.querySelector('h4');
            var title   = titleEl ? titleEl.textContent : 'News';
            var src     = item.dataset.img || '';
            var isVideo = false;

            if (!src) {
                var imgEl = item.querySelector('.news-item-image img');
                var vidEl = item.querySelector('.news-item-image video, .news-item-image source');
                if (imgEl && imgEl.src)  { src = imgEl.src; }
                else if (vidEl)          { src = vidEl.src || ''; isVideo = true; }
            }
            if (!src || src.startsWith('blob:')) {
                src = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80';
            }

            var card = document.createElement('div');
            card.className       = 'dashboard-news-card';
            card.dataset.navTarget = 'news';
            card.style.cssText   = 'flex:0 0 220px;width:220px;border-radius:14px;overflow:hidden;'
                + 'cursor:pointer;box-shadow:0 4px 16px rgba(91,14,166,0.12);transition:all 0.25s;background:white;';
            card.innerHTML = (isVideo
                ? '<video src="' + src + '" muted loop autoplay playsinline style="width:100%;height:140px;object-fit:cover;"></video>'
                : '<img src="' + src + '" alt="' + _attr(title) + '" loading="lazy"'
                    + ' style="width:100%;height:140px;object-fit:cover;"'
                    + ' onerror="this.src=\'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80\'">')
                + '<div class="dashboard-news-card-info" style="padding:12px;">'
                + '<h5 style="font-size:0.85rem;font-weight:700;color:var(--primary-color);'
                + 'white-space:normal;line-height:1.3;">' + _esc(title) + '</h5></div>';

            slider.appendChild(card);
        });

        container.style.display = newsItems.length > 0 ? 'block' : 'none';
    }
    window.renderDashboardNews = renderDashboardNews;


    /* =========================================================================
       §6  SUGGESTED USERS WIDGET
       ========================================================================= */

    /**
     * Populate the suggested users slider in #suggested-users-container.
     * Fetches users from Firestore once per session; subsequent calls use cache.
     */
    function renderSuggestedUsers() {
        var container = document.getElementById('suggested-users-container');
        var slider    = document.getElementById('suggested-users-slider');
        var bioCard   = document.getElementById('home-user-bio-card');
        var us        = _us();
        if (_isGuest() || !container || !slider) return;

        /* Kick off Firestore fetch once */
        if (window.fbDb && window._firebaseLoaded && !window._suggestedFetchDone) {
            window._suggestedFetchDone = true;
            window.fbDb.collection('users').limit(40).get()
                .then(function (snap) {
                    window._firestoreSuggestedUsers = snap.docs.map(function (d) {
                        var u = d.data(); u.id = d.id; return u;
                    }).filter(function (u) { return u.id && u.username; });
                    renderSuggestedUsers();
                }).catch(function (e) { console.warn('[SuggestedUsers] fetch failed:', e && e.message); });
        }

        /* Merge Firestore + mockUsers */
        var allUsers = Object.assign({}, window.mockUsers || {});
        (window._firestoreSuggestedUsers || []).forEach(function (u) { allUsers[u.id] = u; });

        var followedSet = us.followedUserIds instanceof Set
            ? us.followedUserIds
            : new Set(Array.isArray(us.followedUserIds) ? us.followedUserIds : []);

        var toSuggest = Object.values(allUsers).filter(function (u) {
            return u.id !== us.id && !followedSet.has(u.id);
        });

        slider.innerHTML = '';

        if (toSuggest.length > 0) {
            toSuggest.slice(0, 5).forEach(function (user) {
                var cvr  = (user.coverPhoto && user.coverPhoto.startsWith('http')) ? user.coverPhoto : '';
                var av   = user.avatar
                    || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(user.fullName || 'U') + '&background=1B2B8B&color=fff&size=150');
                var flwrs = (user.followerCount || 0).toLocaleString();
                var flwing = (user.followedUserIds
                    ? (typeof user.followedUserIds.size === 'number' ? user.followedUserIds.size
                        : (Array.isArray(user.followedUserIds) ? user.followedUserIds.length : 0)) : 0).toLocaleString();
                var empy  = typeof user.empyBalance === 'number' ? user.empyBalance.toFixed(2) : '0.00';
                var bio   = user.bio ? (user.bio.length > 60 ? user.bio.substring(0, 58) + '…' : user.bio) : '';

                var card = document.createElement('div');
                card.className     = 'suggested-user-card';
                card.dataset.userId = user.id;
                card.title          = 'View ' + (user.fullName || user.username || 'profile');
                card.innerHTML =
                    '<div style="height:110px;background:'
                    + (cvr ? 'url(' + cvr + ') center/cover no-repeat' : 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)')
                    + ';border-radius:14px 14px 0 0;flex-shrink:0;position:relative;"></div>'
                    + '<div style="padding:0 16px 16px;position:relative;">'
                    + '<img src="' + _attr(av) + '" alt="' + _attr(user.fullName || '') + '" loading="lazy"'
                    + ' style="width:72px;height:72px;border-radius:50%;object-fit:cover;'
                    + 'border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.15);margin-top:-36px;display:block;background:#e8eaf6;"'
                    + ' onerror="this.src=\'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.fullName || 'U') + '&background=1B2B8B&color=fff&size=150\'">'
                    + '<button class="btn follow-btn" data-user-id="' + user.id + '"'
                    + ' style="position:absolute;top:10px;right:16px;padding:8px 22px;border-radius:50px;'
                    + 'font-size:0.85rem;font-weight:700;background:transparent;'
                    + 'border:2px solid var(--primary,#1B2B8B);color:var(--primary,#1B2B8B);cursor:pointer;white-space:nowrap;">Follow</button>'
                    + '<div style="margin-top:8px;">'
                    + '<strong style="display:block;font-size:1.05rem;font-weight:800;color:var(--primary,#0A0E27);'
                    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                    + _esc(user.fullName || user.username || 'User') + '</strong>'
                    + '<span style="font-size:0.82rem;color:#888;display:block;margin-top:1px;">@' + _esc(user.username || '') + '</span>'
                    + (bio ? '<p style="font-size:0.85rem;color:#444;margin:8px 0 0;line-height:1.4;">' + _esc(bio) + '</p>' : '')
                    + '<div style="border-top:1px solid rgba(10,14,39,0.1);margin:12px 0;"></div>'
                    + '<div style="display:flex;gap:24px;font-size:0.85rem;color:#555;margin-bottom:8px;">'
                    + '<span><b style="font-size:1rem;font-weight:800;color:var(--primary,#0A0E27);">' + flwrs + '</b> Followers</span>'
                    + '<span><b style="font-size:1rem;font-weight:800;color:var(--primary,#0A0E27);">' + flwing + '</b> Following</span>'
                    + '</div>'
                    + '<div style="display:flex;align-items:center;gap:7px;font-size:0.9rem;color:#444;">'
                    + '<span style="font-size:1.1rem;">🏛️</span>'
                    + '<b style="font-size:1rem;font-weight:800;color:var(--primary,#0A0E27);">' + _esc(empy) + '</b>'
                    + '<span style="font-weight:600;color:#888;">EMPY</span></div>'
                    + '</div></div>';

                card.addEventListener('click', function (e) {
                    if (e.target.classList.contains('follow-btn') || e.target.closest('.follow-btn')) return;
                    window._viewingOtherProfile = (user.id !== us.id);
                    if (typeof window.renderUserProfile === 'function') window.renderUserProfile(user.id);
                    if (typeof window.navigateTo       === 'function') window.navigateTo('profile', true);
                });

                slider.appendChild(card);
            });

            container.style.display = 'block';
            if (bioCard) bioCard.style.display = 'block';
        } else {
            container.style.display = 'none';
            if (bioCard) bioCard.style.display = 'none';
        }
    }
    window.renderSuggestedUsers = renderSuggestedUsers;


    /* =========================================================================
       §7  PROFILE GALLERY HELPER
       ========================================================================= */

    /**
     * Accumulate Cloudinary URLs into the profile gallery grid.
     * Skips duplicates and blob:// URLs.
     * @param {string[]} urls
     */
    function _addUrlsToProfileGallery(urls) {
        var gallery = document.getElementById('profile-gallery');
        if (!gallery || !urls || !urls.length) return;
        urls.forEach(function (url) {
            if (!url || url.startsWith('blob:')) return;
            if (gallery.querySelector('[data-url="' + url + '"]')) return;

            var isVid = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url) || /\/video\/upload\//i.test(url);
            var item  = document.createElement('div');
            item.className      = 'gallery-item';
            item.dataset.url     = url;
            item.style.cssText   = 'position:relative;overflow:hidden;border-radius:12px;cursor:pointer;background:#f0f0f0;';
            item.innerHTML = isVid
                ? '<video src="' + url + '" style="width:100%;height:100%;object-fit:cover;" muted preload="metadata" playsinline></video>'
                : '<img src="' + url + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;"'
                    + ' onerror="this.closest(\'.gallery-item\').style.display=\'none\'">';
            gallery.appendChild(item);
        });
    }
    window._addUrlsToProfileGallery = _addUrlsToProfileGallery;


    /* =========================================================================
       §8  REEL VIEWER
       ========================================================================= */

    /**
     * Attach click handlers to reel cards and preview cards so they open
     * the full-screen reel viewer.
     * Uses MutationObserver to catch cards added dynamically.
     */
    function setupReelViewerObserver() {
        function _bindCard(card) {
            if (card._reelViewerBound) return;
            card._reelViewerBound = true;
            card.addEventListener('click', function (e) {
                if (e.target.closest('.options-btn, .options-menu, .edit-post-btn, .delete-post-btn')) return;
                openReelViewer(card);
            });
        }

        document.querySelectorAll('.reel-card, .reel-preview-card, .dashboard-reel-card')
            .forEach(_bindCard);

        var obs = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.classList && (
                        node.classList.contains('reel-card') ||
                        node.classList.contains('reel-preview-card') ||
                        node.classList.contains('dashboard-reel-card')
                    )) { _bindCard(node); }
                    node.querySelectorAll && node.querySelectorAll(
                        '.reel-card,.reel-preview-card,.dashboard-reel-card'
                    ).forEach(_bindCard);
                });
            });
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }
    window.setupReelViewerObserver = setupReelViewerObserver;

    /**
     * Open the full-screen reel viewer for a given reel card.
     * @param {HTMLElement} clickedCard — .reel-card or .reel-preview-card
     */
    function openReelViewer(clickedCard) {
        var videoUrl = clickedCard.dataset.videoUrl
            || (clickedCard.querySelector('video') && clickedCard.querySelector('video').src)
            || '';
        if (!videoUrl || videoUrl.startsWith('blob:')) return;

        var overlay = document.getElementById('reel-viewer-modal-overlay');
        var ct      = document.getElementById('reel-viewer-container');
        if (!overlay || !ct) return;

        ct.innerHTML = '';
        var vi = document.createElement('div');
        vi.className      = 'reel-viewer-item';
        vi.style.cssText  = 'position:relative;width:100%;height:100%;background:#000;'
            + 'flex-shrink:0;display:flex;align-items:center;justify-content:center;';
        vi.innerHTML =
            '<video src="' + videoUrl + '" style="width:100%;height:100%;object-fit:contain;"'
            + ' controls autoplay playsinline></video>';
        ct.appendChild(vi);
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
    window.openReelViewer = openReelViewer;


    /* =========================================================================
       §9  VIEW-COUNT OBSERVER
       ========================================================================= */

    /**
     * IntersectionObserver that increments view counts on post cards
     * when they scroll into view.  Only counts once per post per session.
     */
    (function _setupViewCountObserver() {
        var viewed = new Set();
        var obs    = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el     = entry.target;
                var postId = el.dataset.postId;
                if (!postId || viewed.has(postId)) return;
                viewed.add(postId);
                obs.unobserve(el);
                var vc = el.querySelector('.view-count');
                if (vc) vc.textContent = parseInt(vc.textContent || '0') + 1;
            });
        }, { threshold: 0.5 });

        var cardObs = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.classList && node.classList.contains('impact-story')) obs.observe(node);
                    node.querySelectorAll && node.querySelectorAll('.impact-story').forEach(function (s) { obs.observe(s); });
                });
            });
        });
        cardObs.observe(document.body, { childList: true, subtree: true });

        /* Observe already-present cards */
        document.querySelectorAll('.impact-story').forEach(function (s) { obs.observe(s); });
    })();


    /* =========================================================================
       PRIVATE UTILITIES
       ========================================================================= */

    function _attr(str) { return String(str || '').replace(/"/g, '&quot;'); }
    function _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }


    /* Bootstrap reel viewer on load */
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(setupReelViewerObserver, 400);
    });
    setTimeout(setupReelViewerObserver, 1000);

    console.log('[EmpFeed] ✅ Feed module ready — post builder, 8 listeners, dashboard widgets loaded.');

})();