/* =============================================================================
   EMPYREAN INTERNATIONAL — BUSINESS PAGE MODULE
   app-business.js  |  v1.0  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Standalone business page system extracted from app-fixes.js. Covers:

     • renderBusinessPage()          — full business page section renderer
     • renderDashboardBusinesses()   — horizontal home-page showcase card
     • Business page creation form handler
     • Business post creation & media upload
     • Business cover / profile photo upload handlers
     • Business page follow / unfollow
     • Business page inline field editing (name, tagline, email, phone, address)
     • Business page share & promote buttons
     • Gallery upload handler
     • Firestore sync for all business operations
     • Home dashboard "Featured Businesses" horizontal scroll card

   LOAD ORDER
   ──────────
   Must come AFTER: firebase-init, app-state, app-helpers, app-dom,
                    app-auth, app-feed.
   <script src="app-business.js"></script>   — before app-fixes.js

   DEPENDS ON
   ──────────
   • window.fbDb / window._firebaseLoaded    (firebase-init.js)
   • window.userState / window.isGuest       (app-fixes.js / app-state.js)
   • window.mockUsers                        (app-fixes.js)
   • window.showNotification                 (app-helpers.js)
   • window.navigateTo                       (app-dom.js / app-nav.js)
   • window.uploadToCloudinary               (app-helpers.js)
   • window.uploadMediaFilesToCloudinary     (app-fixes.js polyfill)
   • window.handleMediaPreview               (app-helpers.js)
   • window.resizeAndCropImage               (app-helpers.js)
   • window.createNewPostElement             (app-feed.js)

   PUBLIC API
   ──────────
   window.renderBusinessPage()
   window.renderDashboardBusinesses()
   window._bizPostMediaFiles  — shared file buffer (replaces local var)

   SECTION MAP
   ───────────
   §0  Guard & helpers
   §1  renderBusinessPage   — full-page renderer
   §2  renderDashboardBusinesses — home horizontal card
   §3  Business creation form submit
   §4  Business post form submit
   §5  Cover photo upload handler
   §6  Profile photo upload handler
   §7  Page cover/profile preview (modal form)
   §8  Business post media input
   §9  Inline field edit (name, tagline, email, phone, address)
   §10 Share & Promote buttons
   §11 Business-page follow/unfollow
   §12 Gallery upload handler
   §13 Create-business-page modal open trigger
   §14 Bootstrap — wire all click/change/submit listeners

   ============================================================================= */

(function empyreanBusinessModule() {
    'use strict';

    /* ── Guard against double-load ── */
    if (window._empyreanBusinessLoaded) {
        console.warn('[EmpBusiness] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanBusinessLoaded = true;

    /* =========================================================================
       §0  HELPERS & STATE ACCESSORS
       ========================================================================= */

    function _us()      { return (window.EmpState && window.EmpState.userState) || window.userState || {}; }
    function _isGuest() {
        var s = window.EmpState || {};
        return s.isGuest != null ? s.isGuest : !!window.isGuest;
    }
    function _notify(msg, type) {
        if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
    }
    function _nav(section, silent) {
        if (typeof window.navigateTo === 'function') window.navigateTo(section, silent);
    }
    function _esc(s) {
        return String(s || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* Shared media buffer — replaces the local businessPostMediaFiles variable
       that lived inside app-fixes.js. Exposed on window so app-fixes media
       clear logic still works if called externally.                          */
    window._bizPostMediaFiles = window._bizPostMediaFiles || [];

    /* Private upload-state for the creation modal */
    var _newPageCoverFile   = null;
    var _newPageProfileFile = null;

    /* =========================================================================
       §1  renderBusinessPage  — FULL SECTION RENDERER
       =========================================================================
       Writes the complete HTML for #business-page. Called:
         • After initializeApp (logged-in users only)
         • After create-business-page-form submit
         • On navigateTo('business-page') when the section becomes active
       ========================================================================= */

    function renderBusinessPage() {
        var section = document.getElementById('business-page');
        if (!section) return;

        var us  = _us();
        var biz = us.businessPage;

        /* ── No page yet — show creation prompt ── */
        if (!biz) {
            section.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
                + 'min-height:60vh;padding:40px 20px;text-align:center;">'
                + '<div style="width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#0A0E27,#1B2B8B);'
                + 'display:flex;align-items:center;justify-content:center;margin-bottom:24px;'
                + 'box-shadow:0 8px 32px rgba(27,43,139,0.25);">'
                + '<i class="fas fa-briefcase" style="font-size:2rem;color:#F5C518;"></i></div>'
                + '<h2 style="font-family:Syne,sans-serif;font-weight:800;color:#0A0E27;margin:0 0 12px;">'
                + 'Create Your Business Page</h2>'
                + '<p style="color:#6B7280;font-size:0.95rem;max-width:380px;line-height:1.6;margin:0 0 28px;">'
                + 'Showcase your organisation, post updates, and connect with the Empyrean community.</p>'
                + '<button id="open-create-biz-page-btn" class="btn btn-accent" '
                + 'style="padding:14px 36px;border-radius:50px;font-size:1rem;font-weight:700;'
                + 'background:linear-gradient(135deg,#0A0E27,#1B2B8B);color:white;border:none;cursor:pointer;'
                + 'box-shadow:0 6px 20px rgba(27,43,139,0.3);">'
                + '<i class="fas fa-plus"></i> Create Business Page</button>'
                + '</div>';

            /* Wire the button */
            var openBtn = document.getElementById('open-create-biz-page-btn');
            if (openBtn && !openBtn._bizWired) {
                openBtn._bizWired = true;
                openBtn.addEventListener('click', function () {
                    var modal = document.getElementById('create-business-page-modal');
                    if (modal) { modal.classList.add('show'); document.body.classList.add('modal-open'); }
                });
            }
            return;
        }

        /* ── Page exists — render full page ── */
        var coverBg   = biz.coverPhoto
            ? 'url(\'' + biz.coverPhoto + '\') center/cover no-repeat'
            : 'linear-gradient(160deg,#0A0E27 0%,#1B2B8B 60%,#0A0E27 100%)';
        var profSrc   = biz.profilePhoto
            || ('https://ui-avatars.com/api/?name='
                + encodeURIComponent(biz.name || 'B')
                + '&background=5B0EA6&color=fff&size=150');
        var followers = (biz.followerCount || 0).toLocaleString();

        section.innerHTML =
        /* ── HEADER ── */
        '<div class="business-page-header">'

        /* Cover photo */
        + '<div id="business-page-cover-photo" class="cover-photo-container" '
        + 'style="height:220px;background:' + coverBg + ';position:relative;cursor:pointer;" '
        + 'title="Click to change cover photo">'
        + '<label for="business-cover-photo-input" style="position:absolute;bottom:12px;right:14px;'
        + 'background:rgba(10,14,39,0.65);color:white;border-radius:10px;padding:7px 14px;'
        + 'font-size:0.78rem;font-weight:600;cursor:pointer;backdrop-filter:blur(6px);'
        + 'display:flex;align-items:center;gap:7px;">'
        + '<i class="fas fa-camera"></i> Change Cover</label>'
        + '<input type="file" id="business-cover-photo-input" accept="image/*" style="display:none;">'
        + '</div>'

        /* Profile section */
        + '<div style="padding:0 24px 24px;background:white;">'
        + '<div style="display:flex;align-items:flex-end;gap:16px;margin-top:-40px;flex-wrap:wrap;">'

        /* Profile picture */
        + '<div style="position:relative;flex-shrink:0;">'
        + '<img id="business-page-profile-pic" src="' + _esc(profSrc) + '" alt="' + _esc(biz.name) + '" '
        + 'style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:4px solid white;'
        + 'box-shadow:0 4px 16px rgba(0,0,0,0.18);">'
        + '<label for="business-profile-photo-input" '
        + 'style="position:absolute;bottom:2px;right:2px;background:var(--secondary,#1B2B8B);'
        + 'color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;'
        + 'justify-content:center;cursor:pointer;font-size:0.7rem;">'
        + '<i class="fas fa-camera"></i></label>'
        + '<input type="file" id="business-profile-photo-input" accept="image/*" style="display:none;">'
        + '</div>'

        /* Name, tagline, meta */
        + '<div style="flex:1;min-width:180px;padding-bottom:4px;">'
        + '<h2 id="business-page-name" style="font-family:Syne,sans-serif;font-weight:800;'
        + 'font-size:1.35rem;color:#0A0E27;margin:0 0 4px;display:flex;align-items:center;gap:8px;">'
        + _esc(biz.name || 'My Business')
        + '<i class="fas fa-pen edit-icon" data-field="name" title="Edit name" '
        + 'style="font-size:0.65rem;color:#9CA3AF;cursor:pointer;"></i></h2>'
        + '<p id="business-page-tagline" style="color:#6B7280;font-size:0.92rem;margin:0 0 8px;'
        + 'display:flex;align-items:center;gap:8px;">'
        + _esc(biz.tagline || '')
        + '<i class="fas fa-pen edit-icon" data-field="tagline" title="Edit tagline" '
        + 'style="font-size:0.6rem;color:#9CA3AF;cursor:pointer;"></i></p>'
        + '<div style="display:flex;gap:16px;font-size:0.82rem;color:#6B7280;flex-wrap:wrap;">'
        + '<span><i class="fas fa-users" style="color:var(--secondary,#1B2B8B);margin-right:4px;"></i>'
        + '<strong id="business-page-follower-count">' + followers + '</strong> Followers</span>'
        + (biz.industry ? '<span><i class="fas fa-industry" style="margin-right:4px;"></i>' + _esc(biz.industry) + '</span>' : '')
        + '</div>'
        + '</div>'

        /* Action buttons */
        + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-left:auto;">'
        + '<button class="btn follow-btn business-page-share-btn" data-user-id="' + _esc(biz.id) + '" '
        + 'style="border-radius:50px;padding:9px 20px;font-size:0.85rem;font-weight:700;'
        + 'background:transparent;border:2px solid #0A0E27;color:#0A0E27;">'
        + '<i class="fas fa-share"></i> Share</button>'
        + '<button class="btn btn-accent business-page-promote-btn" '
        + 'style="border-radius:50px;padding:9px 20px;font-size:0.85rem;font-weight:700;">'
        + '<i class="fas fa-bullhorn"></i> Promote</button>'
        + '</div>'
        + '</div>'

        /* Contact row */
        + '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:16px;'
        + 'padding-top:14px;border-top:1px solid rgba(10,14,39,0.06);font-size:0.83rem;color:#6B7280;">'
        + '<span><i class="fas fa-envelope" style="color:var(--secondary,#1B2B8B);margin-right:5px;"></i>'
        + '<span id="business-page-email-span">' + _esc(biz.email || '—') + '</span> '
        + '<i class="fas fa-pen edit-icon" data-field="email" '
        + 'style="font-size:0.6rem;color:#9CA3AF;cursor:pointer;"></i></span>'
        + '<span><i class="fas fa-phone" style="color:var(--secondary,#1B2B8B);margin-right:5px;"></i>'
        + '<span id="business-page-phone-span">' + _esc(biz.phone || '—') + '</span> '
        + '<i class="fas fa-pen edit-icon" data-field="phone" '
        + 'style="font-size:0.6rem;color:#9CA3AF;cursor:pointer;"></i></span>'
        + '<span><i class="fas fa-map-marker-alt" style="color:var(--secondary,#1B2B8B);margin-right:5px;"></i>'
        + '<span id="business-page-address-span">' + _esc(biz.address || '—') + '</span> '
        + '<i class="fas fa-pen edit-icon" data-field="address" '
        + 'style="font-size:0.6rem;color:#9CA3AF;cursor:pointer;"></i></span>'
        + '</div>'
        + '</div>'   /* end profile section */
        + '</div>'   /* end .business-page-header */

        /* ── CONTENT GRID ── */
        + '<div class="business-page-content" style="display:grid;grid-template-columns:1fr 2fr;'
        + 'gap:20px;margin-top:20px;align-items:start;">'

        /* LEFT COLUMN — about + gallery */
        + '<div style="display:flex;flex-direction:column;gap:16px;">'

        /* About card */
        + '<div class="card" style="padding:20px;">'
        + '<h4 style="font-family:Syne,sans-serif;font-weight:700;color:#0A0E27;'
        + 'margin:0 0 14px;font-size:1rem;">About</h4>'
        + '<div style="font-size:0.85rem;color:#6B7280;line-height:1.6;display:flex;flex-direction:column;gap:10px;">'
        + '<div><i class="fas fa-briefcase" style="color:var(--secondary,#1B2B8B);width:16px;margin-right:6px;"></i>'
        + _esc(biz.industry || 'Industry not set') + '</div>'
        + '<div><i class="fas fa-envelope" style="color:var(--secondary,#1B2B8B);width:16px;margin-right:6px;"></i>'
        + '<span id="business-about-email">' + _esc(biz.email || '—') + '</span></div>'
        + '<div><i class="fas fa-phone" style="color:var(--secondary,#1B2B8B);width:16px;margin-right:6px;"></i>'
        + '<span id="business-about-phone">' + _esc(biz.phone || '—') + '</span></div>'
        + '<div><i class="fas fa-map-marker-alt" style="color:var(--secondary,#1B2B8B);width:16px;margin-right:6px;"></i>'
        + '<span id="business-about-address">' + _esc(biz.address || '—') + '</span></div>'
        + '</div>'
        + '</div>'

        /* Media gallery card */
        + '<div class="card" style="padding:20px;">'
        + '<h4 style="font-family:Syne,sans-serif;font-weight:700;color:#0A0E27;'
        + 'margin:0 0 14px;font-size:1rem;">Gallery</h4>'
        + '<div id="business-media-gallery" style="display:grid;grid-template-columns:repeat(3,1fr);'
        + 'gap:6px;border-radius:12px;overflow:hidden;">'
        + '<label for="business-gallery-upload" '
        + 'style="aspect-ratio:1;background:rgba(27,43,139,0.05);border:2px dashed rgba(27,43,139,0.2);'
        + 'border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;'
        + 'cursor:pointer;color:#6B7280;font-size:0.75rem;gap:5px;transition:all 0.2s;">'
        + '<i class="fas fa-plus" style="font-size:1.1rem;color:var(--secondary,#1B2B8B);"></i>'
        + 'Add Photo</label>'
        + '<input type="file" id="business-gallery-upload" accept="image/*,video/*" multiple style="display:none;">'
        + '</div>'
        + '</div>'

        + '</div>'  /* end left column */

        /* RIGHT COLUMN — post compose + feed */
        + '<div style="display:flex;flex-direction:column;gap:16px;">'

        /* Post compose card */
        + '<div class="card" style="padding:20px;">'
        + '<form id="create-business-post-form" novalidate>'
        + '<textarea id="business-post-text" name="business-post-text" rows="3" '
        + 'placeholder="Share an update with your community..." '
        + 'style="width:100%;border:1.5px solid rgba(10,14,39,0.1);border-radius:14px;padding:14px;'
        + 'font-size:0.92rem;resize:none;outline:none;font-family:inherit;'
        + 'transition:border-color 0.2s;box-sizing:border-box;"></textarea>'
        + '<div id="business-post-media-preview" style="margin-top:8px;"></div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;">'
        + '<label for="business-post-media-input" class="btn" '
        + 'style="background:rgba(27,43,139,0.06);color:var(--secondary,#1B2B8B);border:1.5px dashed '
        + 'rgba(27,43,139,0.2);border-radius:10px;padding:8px 16px;cursor:pointer;font-size:0.82rem;'
        + 'font-weight:600;display:flex;align-items:center;gap:7px;">'
        + '<i class="fas fa-images"></i> Add Photo/Video</label>'
        + '<input type="file" id="business-post-media-input" accept="image/*,video/*" multiple style="display:none;">'
        + '<button type="submit" class="btn btn-accent" '
        + 'style="border-radius:50px;padding:9px 24px;font-size:0.88rem;font-weight:700;">'
        + '<i class="fas fa-paper-plane"></i> Post</button>'
        + '</div>'
        + '</form>'
        + '</div>'

        /* Posts feed */
        + '<div id="business-page-feed-container">'
        + '<div style="text-align:center;padding:40px 20px;color:#9CA3AF;">'
        + '<i class="fas fa-newspaper" style="font-size:2.5rem;margin-bottom:12px;color:rgba(27,43,139,0.2);"></i>'
        + '<p style="margin:0;font-size:0.9rem;">No posts yet — share your first update above!</p>'
        + '</div>'
        + '</div>'

        + '</div>'  /* end right column */
        + '</div>'  /* end .business-page-content */

        /* ── Responsive: collapse to single column on small screens ── */
        + '<style>'
        + '@media(max-width:700px){'
        + '.business-page-content{grid-template-columns:1fr!important;}'
        + '#business-page-cover-photo{height:160px!important;}'
        + '}'
        + '</style>';

        /* Wire up gallery input AFTER HTML is in the DOM */
        _wireGalleryInput();

        /* Load existing posts from Firestore */
        _loadBusinessPosts(biz.id);

        console.log('[EmpBusiness] renderBusinessPage: rendered for', biz.name);
    }
    window.renderBusinessPage = renderBusinessPage;


    /* =========================================================================
       §2  renderDashboardBusinesses  — HOME HORIZONTAL CARD
       =========================================================================
       Mirrors the pattern of dashboard-news-slider / dashboard-reels-slider.
       Shows featured business pages in a horizontally scrollable card on the
       home (dashboard) section — identical UX to Reel, Marketplace, News.
       ========================================================================= */

    function renderDashboardBusinesses() {
        var container = document.getElementById('dashboard-business-container');
        var slider    = document.getElementById('dashboard-business-slider');
        if (!container || !slider) return;

        slider.innerHTML = '';

        /* Collect pages: current user's page + any saved in Firestore cache */
        var pages = [];
        var us = _us();
        if (us.businessPage) pages.push(us.businessPage);

        /* Merge from Firestore cache if available */
        var cached = window._firestoreBusinessPages || [];
        cached.forEach(function (p) {
            if (!pages.find(function (x) { return x.id === p.id; })) pages.push(p);
        });

        /* Fallback sample cards so the slider never appears empty for guests */
        if (pages.length === 0) {
            pages = [
                { id: 'biz-demo-1', name: 'AgroTech Africa', tagline: 'Smart farming for a better tomorrow', industry: 'Agriculture',
                  profilePhoto: 'https://ui-avatars.com/api/?name=AgroTech&background=1B2B8B&color=fff&size=150',
                  coverPhoto:   'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&q=70', followerCount: 1240 },
                { id: 'biz-demo-2', name: 'HealthBridge NG', tagline: 'Connecting patients to care', industry: 'Healthcare',
                  profilePhoto: 'https://ui-avatars.com/api/?name=HealthBridge&background=5B0EA6&color=fff&size=150',
                  coverPhoto:   'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&q=70', followerCount: 876 },
                { id: 'biz-demo-3', name: 'EduReach', tagline: 'Quality education, unlimited access', industry: 'Education',
                  profilePhoto: 'https://ui-avatars.com/api/?name=EduReach&background=0A0E27&color=F5C518&size=150',
                  coverPhoto:   'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&q=70', followerCount: 2105 },
                { id: 'biz-demo-4', name: 'TechSpark Lagos', tagline: 'Building Africa\'s digital future', industry: 'Technology',
                  profilePhoto: 'https://ui-avatars.com/api/?name=TechSpark&background=F5C518&color=0A0E27&size=150',
                  coverPhoto:   'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=70', followerCount: 3810 }
            ];
        }

        pages.slice(0, 8).forEach(function (biz) {
            var coverSrc = biz.coverPhoto || '';
            var profSrc  = biz.profilePhoto
                || ('https://ui-avatars.com/api/?name='
                    + encodeURIComponent(biz.name || 'B')
                    + '&background=1B2B8B&color=fff&size=100');
            var followers = (biz.followerCount || 0).toLocaleString();

            var card = document.createElement('div');
            card.className       = 'dashboard-business-card';
            card.dataset.bizId   = biz.id;
            card.dataset.navTarget = 'business-page';
            card.title           = biz.name;
            card.style.cssText   =
                'flex:0 0 200px;width:200px;border-radius:16px;overflow:hidden;cursor:pointer;'
                + 'box-shadow:0 4px 18px rgba(27,43,139,0.13);transition:all 0.25s;'
                + 'background:white;border:1px solid rgba(10,14,39,0.07);';

            card.innerHTML =
                /* Cover */
                '<div style="height:110px;background:'
                + (coverSrc ? 'url(\'' + coverSrc + '\') center/cover no-repeat'
                            : 'linear-gradient(135deg,#0A0E27,#1B2B8B)')
                + ';position:relative;"></div>'

                /* Profile pic overlaid */
                + '<div style="padding:0 14px 14px;position:relative;">'
                + '<img src="' + _esc(profSrc) + '" alt="' + _esc(biz.name) + '" loading="lazy" '
                + 'style="width:52px;height:52px;border-radius:50%;object-fit:cover;'
                + 'border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.15);'
                + 'margin-top:-26px;display:block;background:#e8eaf6;" '
                + 'onerror="this.src=\'https://ui-avatars.com/api/?name='
                + encodeURIComponent(biz.name || 'B') + '&background=1B2B8B&color=fff&size=100\'">'
                + '<div style="margin-top:8px;">'
                + '<strong style="display:block;font-size:0.9rem;font-weight:800;color:#0A0E27;'
                + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                + _esc(biz.name || 'Business') + '</strong>'
                + (biz.tagline
                    ? '<p style="font-size:0.75rem;color:#6B7280;margin:3px 0 6px;'
                      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                      + _esc(biz.tagline) + '</p>'
                    : '<p style="margin:3px 0 6px;height:14px;"></p>')
                + '<span style="font-size:0.73rem;color:#9CA3AF;">'
                + '<i class="fas fa-users" style="margin-right:3px;color:var(--secondary,#1B2B8B);"></i>'
                + followers + ' followers</span>'
                + '</div>'
                + '</div>';

            /* Hover elevation */
            card.addEventListener('mouseenter', function () {
                card.style.transform  = 'translateY(-3px)';
                card.style.boxShadow  = '0 8px 28px rgba(27,43,139,0.2)';
            });
            card.addEventListener('mouseleave', function () {
                card.style.transform  = '';
                card.style.boxShadow  = '0 4px 18px rgba(27,43,139,0.13)';
            });

            /* Click → navigate to business-page section */
            card.addEventListener('click', function () {
                _nav('business-page');
            });

            slider.appendChild(card);
        });

        /* Show / hide container */
        container.style.display = pages.length > 0 ? 'block' : 'none';

        /* Kick off a live Firestore fetch (once per session) */
        _fetchBusinessPagesFromFirestore();
    }
    window.renderDashboardBusinesses = renderDashboardBusinesses;


    /* ── Firestore page fetcher (populates window._firestoreBusinessPages) ── */
    function _fetchBusinessPagesFromFirestore() {
        if (window._bizPagesFetched) return;
        window._bizPagesFetched = true;
        if (!window.fbDb || !window._firebaseLoaded) return;
        window.fbDb.collection('business_pages').limit(20).get()
            .then(function (snap) {
                window._firestoreBusinessPages = snap.docs.map(function (d) {
                    return Object.assign({ id: d.id }, d.data());
                });
                /* Re-render the slider with live data */
                renderDashboardBusinesses();
            })
            .catch(function (e) {
                console.warn('[EmpBusiness] Firestore fetch failed:', e && e.message);
            });
    }


    /* ── Load existing business posts into the page feed ── */
    function _loadBusinessPosts(pageId) {
        var feed = document.getElementById('business-page-feed-container');
        if (!feed || !pageId || !window.fbDb || !window._firebaseLoaded) return;
        window.fbDb.collection('business_posts')
            .where('pageId', '==', pageId)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get()
            .then(function (snap) {
                if (snap.empty) return;
                feed.innerHTML = '';
                snap.docs.forEach(function (doc) {
                    var d = doc.data();
                    if (typeof window.createNewPostElement === 'function') {
                        var fakeFiles = (d.media || []).map(function (url) {
                            return { _cloudUrl: url, type: /\.(mp4|webm|mov)/i.test(url) ? 'video/mp4' : 'image/jpeg' };
                        });
                        var postEl = window.createNewPostElement(d.text || '', fakeFiles, _us(), true);
                        feed.appendChild(postEl);
                    }
                });
            })
            .catch(function (e) { console.warn('[EmpBusiness] posts fetch:', e && e.message); });
    }


    /* =========================================================================
       §3  BUSINESS PAGE CREATION FORM SUBMIT
       ========================================================================= */

    function _handleCreateBusinessPageSubmit(form) {
        var pageNameInput     = form.querySelector('#page-name');
        var pageTaglineInput  = form.querySelector('#page-tagline');
        var pageIndustrySelect= form.querySelector('#page-industry');
        var pageEmailInput    = form.querySelector('#page-email');
        var pagePhoneInput    = form.querySelector('#page-phone');
        var pageAddressInput  = form.querySelector('#page-address');

        if (!pageNameInput || !pageTaglineInput || !pageIndustrySelect || !pageEmailInput) return;
        if (!pageNameInput.value.trim()) { _notify('Please enter a page name.', 'error'); return; }

        var bizSubmitBtn = form.querySelector('button[type="submit"]');
        if (bizSubmitBtn) bizSubmitBtn.disabled = true;
        _notify('Creating business page...', 'info');

        (async function () {
            try {
                var coverPhotoUrl  = 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80';
                var profilePhotoUrl= 'https://ui-avatars.com/api/?name='
                    + encodeURIComponent(pageNameInput.value)
                    + '&background=5B0EA6&color=fff&size=150';

                if (_newPageCoverFile) {
                    try { coverPhotoUrl = await window.uploadToCloudinary(_newPageCoverFile, null); } catch (e) {}
                }
                if (_newPageProfileFile) {
                    try { profilePhotoUrl = await window.uploadToCloudinary(_newPageProfileFile, null); } catch (e) {}
                }

                var newPage = {
                    id:           'biz-' + Date.now(),
                    name:         pageNameInput.value.trim(),
                    tagline:      pageTaglineInput.value.trim(),
                    industry:     pageIndustrySelect.value,
                    email:        pageEmailInput.value.trim(),
                    phone:        (pagePhoneInput   && pagePhoneInput.value)   || '',
                    address:      (pageAddressInput && pageAddressInput.value) || '',
                    coverPhoto:   coverPhotoUrl,
                    profilePhoto: profilePhotoUrl,
                    followerCount:0,
                    ownerId:      _us().id,
                    createdAt:    new Date().toISOString()
                };

                /* Update shared state */
                if (window.userState) window.userState.businessPage = newPage;
                if (window.mockUsers && window.userState && window.mockUsers[window.userState.id]) {
                    window.mockUsers[window.userState.id].businessPage = newPage;
                }

                /* Persist to Firestore */
                try {
                    await window.fbDb.collection('business_pages').doc(newPage.id).set(newPage);
                    if (typeof window.saveUserToFirestore === 'function')
                        await window.saveUserToFirestore(window.userState.id, window.userState);
                } catch (e) {
                    console.warn('[EmpBusiness] Firestore save failed:', e && e.message);
                }

                /* Close modal */
                var modal = document.getElementById('create-business-page-modal');
                if (modal) modal.classList.remove('show');
                document.body.classList.remove('modal-open');

                /* Reset form state */
                form.reset();
                var coverPreview = document.getElementById('page-cover-photo-preview');
                if (coverPreview) {
                    coverPreview.style.backgroundImage = '';
                    coverPreview.innerHTML = '<i class="fas fa-camera"></i>&nbsp; Add Cover Image';
                }
                var profPreview = document.getElementById('page-profile-photo-preview');
                if (profPreview) profPreview.style.backgroundImage = '';
                _newPageCoverFile   = null;
                _newPageProfileFile = null;

                _notify('✅ Business page created! Opening your page...', 'success');

                /* Navigate and render */
                _nav('business-page');
                setTimeout(function () {
                    renderBusinessPage();
                    var bizSection = document.getElementById('business-page');
                    if (bizSection) bizSection.scrollTop = 0;
                    var mc = document.querySelector('.main-content');
                    if (mc) mc.scrollTop = 0;
                    /* Also refresh the home dashboard card */
                    window._bizPagesFetched = false;
                    renderDashboardBusinesses();
                }, 150);

            } catch (err) {
                console.error('[EmpBusiness] Create page error:', err);
                _notify('Failed to create business page.', 'error');
            } finally {
                if (bizSubmitBtn) bizSubmitBtn.disabled = false;
            }
        }());
    }


    /* =========================================================================
       §4  BUSINESS POST FORM SUBMIT
       ========================================================================= */

    function _handleBusinessPostSubmit(form) {
        var textarea = form.querySelector('textarea');
        if (!textarea) return;
        var text = textarea.value.trim();
        var files = window._bizPostMediaFiles || [];

        if (!text && files.length === 0) {
            _notify('Post cannot be empty.', 'error');
            return;
        }

        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        if (files.length > 0) _notify('Uploading media...', 'info');

        (async function () {
            try {
                var cloudUrls = await window.uploadMediaFilesToCloudinary(files);
                files.forEach(function (f, i) { if (cloudUrls[i]) f._cloudUrl = cloudUrls[i]; });

                var us = _us();
                var newPost = typeof window.createNewPostElement === 'function'
                    ? window.createNewPostElement(text, files, us, true)
                    : null;

                /* Prepend to business page feed */
                var bizFeed = document.getElementById('business-page-feed-container');
                if (bizFeed && newPost) {
                    /* Remove empty-state placeholder if present */
                    var placeholder = bizFeed.querySelector('div[style*="No posts yet"]');
                    if (placeholder) placeholder.remove();
                    bizFeed.prepend(newPost);
                }

                /* Mirror to community dashboard feed */
                try {
                    var dashFeed = document.getElementById('feed-container');
                    if (dashFeed && newPost) dashFeed.prepend(newPost.cloneNode(true));
                } catch (e) {}

                /* Save to Firestore */
                try {
                    if (newPost && us.businessPage) {
                        await window.fbDb.collection('business_posts').doc(newPost.dataset.postId).set({
                            id:        newPost.dataset.postId,
                            userId:    us.id,
                            pageId:    us.businessPage.id,
                            text:      text,
                            media:     cloudUrls.filter(Boolean),
                            createdAt: new Date().toISOString()
                        });
                    }
                } catch (e) { console.warn('[EmpBusiness] Post Firestore save:', e && e.message); }

                /* Reset */
                form.reset();
                window._bizPostMediaFiles = [];
                var preview = form.querySelector('#business-post-media-preview');
                if (preview) preview.innerHTML = '';
                _notify('✅ Posted to your page and the community feed!', 'success');

            } catch (err) {
                console.error('[EmpBusiness] Post submit error:', err);
                _notify('Failed to publish post.', 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        }());
    }


    /* =========================================================================
       §5  COVER PHOTO UPLOAD HANDLER
       ========================================================================= */

    function _handleCoverPhotoChange(file) {
        var reader = new FileReader();
        reader.onload = async function (ev) {
            var localUrl = ev.target.result;
            var coverEl  = document.getElementById('business-page-cover-photo');
            if (coverEl) {
                coverEl.style.backgroundImage    = 'url(\'' + localUrl + '\')';
                coverEl.style.backgroundSize     = 'cover';
                coverEl.style.backgroundPosition = 'center';
            }
            var us = _us();
            if (us.businessPage) us.businessPage.coverPhoto = localUrl;
            _notify('Cover photo updating...', 'info');

            try {
                var cloudUrl = await window.uploadToCloudinary(file, null);
                if (coverEl && cloudUrl !== localUrl) {
                    coverEl.style.backgroundImage = 'url(\'' + cloudUrl + '\')';
                }
                if (us.businessPage) us.businessPage.coverPhoto = cloudUrl;
                try {
                    await window.fbDb.collection('business_pages')
                        .doc(us.businessPage.id).update({ coverPhoto: cloudUrl });
                } catch (e) {}
                _notify('✅ Cover photo saved!', 'success');
            } catch (e) {
                _notify('Cover photo saved locally.', 'info');
            }
        };
        reader.readAsDataURL(file);
    }


    /* =========================================================================
       §6  PROFILE PHOTO UPLOAD HANDLER
       ========================================================================= */

    function _handleProfilePhotoChange(file) {
        if (typeof window.resizeAndCropImage !== 'function') return;
        window.resizeAndCropImage(file, 150, 150, async function (dataUrl) {
            var pic = document.getElementById('business-page-profile-pic');
            if (pic) pic.src = dataUrl;

            var us = _us();
            try {
                var res    = await fetch(dataUrl);
                var blob   = await res.blob();
                var f      = new File([blob], 'biz-profile.jpg', { type: 'image/jpeg' });
                var cloudUrl = await window.uploadToCloudinary(f, null);
                if (pic) pic.src = cloudUrl;
                if (us.businessPage) {
                    us.businessPage.profilePhoto = cloudUrl;
                    await window.fbDb.collection('business_pages')
                        .doc(us.businessPage.id).update({ profilePhoto: cloudUrl });
                }
                _notify('Profile photo updated and saved!', 'success');
            } catch (e) {
                if (us.businessPage) us.businessPage.profilePhoto = dataUrl;
                _notify('Profile photo updated locally.', 'info');
            }
        });
    }


    /* =========================================================================
       §7  MODAL FORM — PAGE COVER / PROFILE PREVIEW
       ========================================================================= */

    function _handlePageCoverPreview(file) {
        _newPageCoverFile = file;
        var preview = document.getElementById('page-cover-photo-preview');
        if (preview) {
            preview.style.backgroundImage = 'url(' + URL.createObjectURL(file) + ')';
            preview.innerHTML = '';
        }
    }

    function _handlePageProfilePreview(file) {
        _newPageProfileFile = file;
        var preview = document.getElementById('page-profile-photo-preview');
        if (preview) {
            preview.style.backgroundImage = 'url(' + URL.createObjectURL(file) + ')';
        }
    }


    /* =========================================================================
       §8  BUSINESS POST MEDIA INPUT
       ========================================================================= */

    function _handleBizPostMediaChange(files) {
        window._bizPostMediaFiles = files;
        if (typeof window.handleMediaPreview === 'function') {
            window.handleMediaPreview(window._bizPostMediaFiles, 'business-post-media-preview');
        }
    }


    /* =========================================================================
       §9  INLINE FIELD EDIT
       ========================================================================= */

    function _handleEditIcon(editIcon) {
        var field = editIcon.dataset.field;
        if (!field) return;

        var us = _us();
        var currentEl, currentValue, promptTitle;

        if (field === 'name' || field === 'tagline') {
            currentEl    = document.getElementById('business-page-' + field);
            currentValue = currentEl ? currentEl.firstChild && currentEl.firstChild.nodeValue
                                        ? currentEl.firstChild.nodeValue.trim()
                                        : currentEl.textContent.replace(/\s+/g,' ').trim() : '';
            promptTitle  = 'Update Page ' + field.charAt(0).toUpperCase() + field.slice(1);
        } else {
            currentEl    = document.getElementById('business-page-' + field + '-span');
            currentValue = currentEl ? currentEl.textContent.trim() : '';
            promptTitle  = 'Update ' + field.charAt(0).toUpperCase() + field.slice(1);
        }

        /* Replace '—' placeholder with empty string for prompt */
        if (currentValue === '—') currentValue = '';

        var newValue = prompt(promptTitle, currentValue);
        if (newValue === null || newValue.trim() === currentValue) return;
        newValue = newValue.trim();

        /* Update DOM */
        if (field === 'name') {
            var nameEl = document.getElementById('business-page-name');
            if (nameEl) {
                /* Re-create text node so we don't blow away the edit icon */
                var tn = document.createTextNode(newValue + ' ');
                while (nameEl.firstChild) nameEl.removeChild(nameEl.firstChild);
                nameEl.appendChild(tn);
                var icon = document.createElement('i');
                icon.className = 'fas fa-pen edit-icon';
                icon.dataset.field = 'name';
                icon.title = 'Edit name';
                icon.style.cssText = 'font-size:0.65rem;color:#9CA3AF;cursor:pointer;';
                nameEl.appendChild(icon);
            }
        } else if (field === 'tagline') {
            var tagEl = document.getElementById('business-page-tagline');
            if (tagEl) {
                var tn2 = document.createTextNode(newValue + ' ');
                while (tagEl.firstChild) tagEl.removeChild(tagEl.firstChild);
                tagEl.appendChild(tn2);
                var icon2 = document.createElement('i');
                icon2.className = 'fas fa-pen edit-icon';
                icon2.dataset.field = 'tagline';
                icon2.title = 'Edit tagline';
                icon2.style.cssText = 'font-size:0.6rem;color:#9CA3AF;cursor:pointer;';
                tagEl.appendChild(icon2);
            }
        } else {
            /* email, phone, address spans */
            var spanEl = document.getElementById('business-page-' + field + '-span');
            if (spanEl) spanEl.textContent = newValue || '—';
            /* Also sync the about card */
            var aboutEl = document.getElementById('business-about-' + field);
            if (aboutEl) aboutEl.textContent = newValue || '—';
        }

        /* Update state */
        if (us.businessPage) us.businessPage[field] = newValue;

        /* Persist */
        if (us.businessPage) {
            try {
                var patch = {};
                patch[field] = newValue;
                window.fbDb.collection('business_pages').doc(us.businessPage.id).update(patch);
            } catch (e) {}
        }

        _notify('Page updated!', 'success');
    }


    /* =========================================================================
       §10  SHARE & PROMOTE BUTTONS
       ========================================================================= */

    function _handleBizShare() {
        var us  = _us();
        var biz = us.businessPage || {};
        if (typeof window.shareContent === 'function') {
            window.shareContent({
                title: biz.name    || 'Business Page',
                text:  biz.tagline || '',
                url:   window.location.href + '#business'
            });
        } else if (navigator.share) {
            navigator.share({ title: biz.name || 'Business Page', url: window.location.href });
        } else {
            _notify('Share link copied!', 'success');
        }
    }

    function _handleBizPromote() {
        var us = _us();
        if (us.businessPage) {
            _notify('Promotion feature coming soon — stay tuned!', 'info');
        } else {
            _notify('Create a business page first.', 'warning');
        }
    }


    /* =========================================================================
       §11  BUSINESS PAGE FOLLOW / UNFOLLOW
       ========================================================================= */

    function _handleBizFollow(followBtn, context) {
        var userId = followBtn.dataset.userId;
        if (!userId || !userId.startsWith('biz-')) return false; /* not a biz follow */

        var us  = _us();
        var biz = us.businessPage;
        if (!biz || biz.id !== userId) return false;

        var followed = us.followedUserIds instanceof Set
            ? us.followedUserIds.has(userId)
            : false;

        if (followed) {
            us.followedUserIds.delete(userId);
            biz.followerCount = Math.max(0, (biz.followerCount || 0) - 1);
            followBtn.innerHTML = '<i class="fas fa-plus"></i> Follow';
            followBtn.classList.remove('followed');
            _notify('Unfollowed ' + biz.name, 'info');
        } else {
            us.followedUserIds.add(userId);
            biz.followerCount = (biz.followerCount || 0) + 1;
            followBtn.innerHTML = '<i class="fas fa-check"></i> Following';
            followBtn.classList.add('followed');
            _notify('Now following ' + biz.name + '!', 'success');
        }

        var countEl = document.getElementById('business-page-follower-count');
        if (countEl) countEl.textContent = biz.followerCount.toLocaleString();
        return true; /* consumed */
    }


    /* =========================================================================
       §12  GALLERY UPLOAD HANDLER
       ========================================================================= */

    function _wireGalleryInput() {
        var galleryInput = document.getElementById('business-gallery-upload');
        if (!galleryInput || galleryInput._bizGalleryWired) return;
        galleryInput._bizGalleryWired = true;

        galleryInput.addEventListener('change', function () {
            var gallery = document.getElementById('business-media-gallery');
            if (!gallery) return;
            Array.from(this.files).forEach(function (file) {
                var url = URL.createObjectURL(file);
                var div = document.createElement('div');
                div.style.cssText = 'aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;';
                div.innerHTML = file.type.startsWith('video/')
                    ? '<video src="' + url + '" style="width:100%;height:100%;object-fit:cover;" muted playsinline loop></video>'
                    : '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">';
                var uploadLabel = gallery.querySelector('label');
                if (uploadLabel) gallery.insertBefore(div, uploadLabel);
                else gallery.appendChild(div);
            });
        });
    }


    /* =========================================================================
       §13  CREATE-BUSINESS-PAGE MODAL TRIGGER
       ========================================================================= */

    /* Exposed so sidebar nav or any external button can open the modal */
    window._openCreateBizPageModal = function () {
        if (_isGuest()) {
            if (typeof window._openAuthModal === 'function') window._openAuthModal();
            return;
        }
        var modal = document.getElementById('create-business-page-modal');
        if (modal) { modal.classList.add('show'); document.body.classList.add('modal-open'); }
    };


    /* =========================================================================
       §14  BOOTSTRAP — WIRE ALL LISTENERS
       =========================================================================
       Uses a single delegated listener pattern consistent with app-fixes.js.
       Uses the 'empyrean-init-done' event so it fires AFTER all modules boot.
       Also wires immediately in case the event already fired.
       ========================================================================= */

    function _bootstrap() {
        /* ── DELEGATED CLICK HANDLER ── */
        document.addEventListener('click', function (e) {
            var target = e.target;
            function closest(sel) {
                return target.closest ? target.closest(sel) : null;
            }

            /* Edit icon (inline field editing) */
            var editIcon = closest('.business-page-content .edit-icon, .business-page-header .edit-icon');
            if (editIcon) { e.preventDefault(); _handleEditIcon(editIcon); return; }

            /* Share button */
            if (closest('.business-page-share-btn')) { e.preventDefault(); _handleBizShare(); return; }

            /* Promote button */
            if (closest('.business-page-promote-btn')) { e.preventDefault(); _handleBizPromote(); return; }

            /* Follow button inside business page area */
            var followBtn = closest('.follow-btn');
            if (followBtn) {
                var inBizPage = !!(closest('.business-page-header') || closest('#business-page'));
                if (inBizPage) {
                    if (_isGuest()) {
                        if (typeof window._openAuthModal === 'function') window._openAuthModal();
                        return;
                    }
                    if (_handleBizFollow(followBtn)) return;
                    /* not consumed — fall through to app-fixes general follow handler */
                }
            }

            /* Dashboard business card click → navigate */
            var bizCard = closest('.dashboard-business-card');
            if (bizCard) { e.preventDefault(); _nav('business-page'); return; }

            /* "Create Business Page" sidebar button (if present) */
            if (closest('#open-create-biz-page-btn')) {
                e.preventDefault();
                window._openCreateBizPageModal();
                return;
            }
        }, false);


        /* ── DELEGATED CHANGE HANDLER ── */
        document.addEventListener('change', function (e) {
            var t = e.target;
            if (!t || !t.id) return;

            if (t.id === 'business-cover-photo-input' && t.files && t.files.length > 0) {
                _handleCoverPhotoChange(t.files[0]);
                return;
            }
            if (t.id === 'business-profile-photo-input' && t.files && t.files.length > 0) {
                _handleProfilePhotoChange(t.files[0]);
                return;
            }
            if (t.id === 'page-cover-photo-input' && t.files && t.files.length > 0) {
                _handlePageCoverPreview(t.files[0]);
                return;
            }
            if (t.id === 'page-profile-photo-input' && t.files && t.files.length > 0) {
                _handlePageProfilePreview(t.files[0]);
                return;
            }
            if (t.id === 'business-post-media-input' && t.files) {
                _handleBizPostMediaChange(t.files);
                return;
            }
        }, false);


        /* ── DELEGATED SUBMIT HANDLER ── */
        document.addEventListener('submit', function (e) {
            var form = e.target;
            if (!form || !form.id) return;

            if (form.id === 'create-business-page-form') {
                e.preventDefault();
                _handleCreateBusinessPageSubmit(form);
                return;
            }
            if (form.id === 'create-business-post-form') {
                e.preventDefault();
                _handleBusinessPostSubmit(form);
                return;
            }
        }, false);


        /* ── RENDER DASHBOARD CARD AFTER INIT ── */
        document.addEventListener('empyrean-init-done', function () {
            renderDashboardBusinesses();
        });

        /* If empyrean-init-done already fired (module loaded late) */
        setTimeout(function () {
            renderDashboardBusinesses();
        }, 800);

        console.log('[EmpBusiness] ✅ app-business.js bootstrapped — business page module ready.');
    }

    /* Run bootstrap once DOM is ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _bootstrap);
    } else {
        _bootstrap();
    }

}());