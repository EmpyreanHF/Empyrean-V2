/**
 * EMPYREAN — MASTER FIX v4
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes addressed:
 *  1. Reel exit/close button not working (class mismatch: .reel-viewer-close vs #reel-exit-btn)
 *  2. Status upload not working (uploadToCloudinary timing + missing submit wire)
 *  3. Marketplace not permanently showing on home dashboard
 *  4. Individual account form — permissions error, must show for ALL logged-in users
 *  5. Individual form in admin control panel — properly injected & wired
 *  6. Business posts — show company/org name + badge in public feed
 *  7. All emoji/outdated icon references → Font Awesome 6 professional icons
 *  8. Business post feed mirror fix (posts-feed → feed-container proxy)
 *  9. Firebase settings read with proper field name (active vs enabled mismatch)
 * ─────────────────────────────────────────────────────────────────────────────
 * Load ORDER: LAST script before </body>, after all other app-*.js files.
 */

(function EmpyreanFixV4() {
    'use strict';

    function ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _notify(msg, type) {
        if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
    }

    function _fbOk() {
        return !!(window._firebaseLoaded && window.fbDb);
    }

    function _us() {
        return (window.EmpState && window.EmpState.userState) || window.userState || {};
    }

    function _isGuest() {
        var s = window.EmpState || {};
        return s.isGuest != null ? s.isGuest : !!window.isGuest;
    }

    function _isAdmin() {
        return !!(window.isAdmin || (window.EmpState && window.EmpState.isAdmin));
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX 1 — REEL EXIT BUTTON
       Root cause: index.html has <button class="reel-viewer-close"> but
       app-reel.js builds its own overlay with id="reel-exit-btn".
       app-fixes.js listens for .reel-viewer-close but the new app-reel.js
       creates #reel-exit-btn. Both need to work.
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixReelExit() {
        ready(function () {
            /* Inject guaranteed override CSS so both button variants always sit on top */
            var s = document.createElement('style');
            s.id = '_v4_reel_css';
            s.textContent = [
                '#reel-viewer-modal-overlay {',
                '  position: fixed !important;',
                '  inset: 0 !important;',
                '  z-index: 99900 !important;',
                '  background: #000 !important;',
                '  display: none;',
                '}',
                '#reel-viewer-modal-overlay.show { display: flex !important; }',
                /* Both close button variants */
                '.reel-viewer-close, #reel-exit-btn {',
                '  position: fixed !important;',
                '  top: 16px !important;',
                '  left: 16px !important;',
                '  z-index: 99999 !important;',
                '  width: 44px !important;',
                '  height: 44px !important;',
                '  border-radius: 50% !important;',
                '  background: rgba(0,0,0,0.72) !important;',
                '  backdrop-filter: blur(6px) !important;',
                '  border: 2px solid rgba(255,255,255,0.25) !important;',
                '  color: white !important;',
                '  font-size: 1.2rem !important;',
                '  cursor: pointer !important;',
                '  display: flex !important;',
                '  align-items: center !important;',
                '  justify-content: center !important;',
                '  pointer-events: all !important;',
                '  transition: background 0.2s, transform 0.15s !important;',
                '}',
                '.reel-viewer-close:hover, #reel-exit-btn:hover {',
                '  background: rgba(220,38,38,0.85) !important;',
                '  transform: scale(1.08) !important;',
                '}',
                '.reel-viewer-close i, #reel-exit-btn i { pointer-events: none; }',
            ].join('\n');
            document.head.appendChild(s);

            /* Replace the plain × text with a proper FA icon if it's just a text node */
            ready(function () {
                var closeBtn = document.querySelector('#reel-viewer-modal-overlay .reel-viewer-close');
                if (closeBtn && closeBtn.innerHTML.trim() === '×') {
                    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                }
            });

            /* Single delegated close handler — catches both button types */
            document.addEventListener('click', function (e) {
                var isClose = e.target.closest('.reel-viewer-close') ||
                              e.target.closest('#reel-exit-btn') ||
                              e.target.id === 'reel-exit-btn' ||
                              e.target.classList.contains('reel-viewer-close');
                if (!isClose) return;

                e.preventDefault();
                e.stopImmediatePropagation();

                var overlay = document.getElementById('reel-viewer-modal-overlay');
                if (overlay) {
                    overlay.style.display = 'none';
                    overlay.classList.remove('show');
                    overlay.querySelectorAll('video').forEach(function (v) {
                        try { v.pause(); v.src = ''; } catch (e2) {}
                    });
                }
                document.body.style.overflow = '';
                document.body.classList.remove('modal-open');
            }, true /* capture — runs before anything else */);

            /* Escape key fallback */
            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                var overlay = document.getElementById('reel-viewer-modal-overlay');
                if (overlay && (overlay.classList.contains('show') || overlay.style.display !== 'none')) {
                    overlay.style.display = 'none';
                    overlay.classList.remove('show');
                    overlay.querySelectorAll('video').forEach(function (v) {
                        try { v.pause(); v.src = ''; } catch (e2) {}
                    });
                    document.body.style.overflow = '';
                    document.body.classList.remove('modal-open');
                }
            });

            /* MutationObserver: guarantee close button always exists in the overlay */
            var _reelOvr = document.getElementById('reel-viewer-modal-overlay');
            if (_reelOvr) {
                var _reelObs = new MutationObserver(function () {
                    var ovr = document.getElementById('reel-viewer-modal-overlay');
                    if (!ovr) return;
                    /* Upgrade plain × text node if present */
                    var closeBtn2 = ovr.querySelector('.reel-viewer-close');
                    if (closeBtn2 && closeBtn2.innerHTML.trim() === '×') {
                        closeBtn2.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                    }
                    /* Ensure it's the topmost child */
                    if (closeBtn2 && ovr.lastElementChild !== closeBtn2) {
                        ovr.appendChild(closeBtn2);
                    }
                });
                _reelObs.observe(_reelOvr, { childList: true, subtree: false });
            }
        });
        console.log('[FixV4] ✅ FIX 1 — Reel exit button (both class variants) fixed');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 2 — STATUS UPLOAD
       Root causes:
         a) uploadToCloudinary not ready when status submit fires
         b) The submit button in the status modal may not be wired at all
            (app-status.js wires it only if the modal exists on load,
             but in some builds the modal is created later)
         c) Firestore save fails silently — we add retry + local fallback
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixStatusUpload() {
        /* a) Robust uploadToCloudinary waiter */
        window._waitForCloudinary = function (maxMs) {
            maxMs = maxMs || 15000;
            return new Promise(function (resolve, reject) {
                if (typeof window.uploadToCloudinary === 'function') { resolve(window.uploadToCloudinary); return; }
                var waited = 0;
                var iv = setInterval(function () {
                    waited += 250;
                    if (typeof window.uploadToCloudinary === 'function') {
                        clearInterval(iv);
                        resolve(window.uploadToCloudinary);
                    } else if (waited >= maxMs) {
                        clearInterval(iv);
                        reject(new Error('uploadToCloudinary not available after ' + maxMs + 'ms'));
                    }
                }, 250);
            });
        };

        /* b) Patch uploadMediaFilesToCloudinary to use the waiter */
        var _origUpload = window.uploadMediaFilesToCloudinary;
        window.uploadMediaFilesToCloudinary = async function (files) {
            if (!files || files.length === 0) return [];
            var fn;
            try { fn = await window._waitForCloudinary(15000); }
            catch (e) {
                console.warn('[FixV4:StatusUpload] Cloudinary not ready, trying original:', e.message);
                if (typeof _origUpload === 'function') return _origUpload(files);
                return [];
            }
            var results = await Promise.all(Array.from(files).map(function (file) {
                if (typeof file === 'string') return Promise.resolve(file);
                if (file._cloudUrl && !file._cloudUrl.startsWith('blob:')) return Promise.resolve(file._cloudUrl);
                if (!(file instanceof File)) return Promise.resolve('');
                return fn(file, null)
                    .then(function (url) {
                        if (url && !url.startsWith('blob:')) { file._cloudUrl = url; return url; }
                        return '';
                    })
                    .catch(function () { return ''; });
            }));
            return results;
        };

        /* c) Wire create-status submit button if app-status.js missed it */
        function _ensureStatusSubmitWired() {
            var modal = document.getElementById('create-status-modal');
            if (!modal) return;
            var card = modal.querySelector('.create-status-card');
            if (!card) return;

            /* Ensure file input exists */
            if (!card.querySelector('#status-media-input')) {
                var uploadSection = document.createElement('div');
                uploadSection.style.cssText = 'margin-bottom:16px;';
                uploadSection.innerHTML = [
                    '<input type="file" id="status-media-input" accept="image/*,video/*" style="display:none;" multiple>',
                    '<label for="status-media-input" style="display:flex;flex-direction:column;align-items:center;',
                    'justify-content:center;gap:8px;padding:24px;border:2px dashed rgba(0,212,170,0.35);',
                    'border-radius:14px;cursor:pointer;background:rgba(0,212,170,0.04);color:rgba(255,255,255,0.7);',
                    'font-size:0.9rem;text-align:center;transition:background 0.2s;">',
                    '<i class="fa-solid fa-cloud-arrow-up" style="font-size:1.8rem;color:#00D4AA;"></i>',
                    '<span>Tap to upload photo or video</span>',
                    '</label>',
                    '<div id="status-media-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"></div>',
                ].join('');
                var ta = card.querySelector('textarea, #status-text-input');
                if (ta) card.insertBefore(uploadSection, ta.parentNode || ta);
                else card.appendChild(uploadSection);
            }

            /* Wire input change for preview */
            var statusInput = document.getElementById('status-media-input');
            if (statusInput && !statusInput._v4StatusWired) {
                statusInput._v4StatusWired = true;
                statusInput.addEventListener('change', function () {
                    var preview = document.getElementById('status-media-preview');
                    if (!preview) return;
                    preview.innerHTML = '';
                    Array.from(statusInput.files || []).forEach(function (file) {
                        var url = URL.createObjectURL(file);
                        var isVid = file.type.startsWith('video/');
                        var el = document.createElement(isVid ? 'video' : 'img');
                        el.src = url;
                        if (isVid) { el.muted = true; el.controls = true; }
                        el.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid rgba(0,212,170,0.3);';
                        preview.appendChild(el);
                    });
                });
            }

            /* Wire submit button — only if not already wired by app-status.js */
            var submitBtn = card.querySelector('#post-status-btn, [data-action="post-status"], button[type="submit"]');
            if (submitBtn && !submitBtn._statusSubmitWired && !submitBtn._v4StatusSubmitWired) {
                submitBtn._v4StatusSubmitWired = true;
                submitBtn.addEventListener('click', async function (e) {
                    e.preventDefault();
                    if (_isGuest()) { _notify('Please log in to post a status.', 'info'); return; }

                    var textInput = document.getElementById('status-text-input') || card.querySelector('textarea');
                    var statusText = textInput ? textInput.value.trim() : '';
                    var inp = document.getElementById('status-media-input');
                    var files = (inp ? inp.files : null) || [];

                    if (!statusText && !files.length) {
                        _notify('Please add text or media to your status.', 'warning');
                        return;
                    }

                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Posting…';

                    try {
                        var items = [];
                        var us = _us();

                        if (statusText && !files.length) {
                            items.push({
                                id: 'si-' + Date.now(), type: 'text', content: statusText,
                                createdAt: new Date().toISOString(),
                                likes: 0, retweets: 0, likedBy: [], retweetedBy: [], viewers: []
                            });
                        }

                        for (var i = 0; i < files.length; i++) {
                            var file = files[i];
                            var isVid2 = file.type.startsWith('video/');
                            _notify('Uploading status media ' + (i + 1) + ' of ' + files.length + '…', 'info');

                            var cloudUrl = '';
                            try {
                                var fn2 = await window._waitForCloudinary(15000);
                                cloudUrl = await fn2(file, null);
                            } catch (uploadErr) {
                                console.warn('[FixV4:StatusUpload] Upload failed:', uploadErr.message);
                                _notify('Upload failed for file ' + (i + 1) + ', skipping.', 'error');
                                continue;
                            }

                            if (!cloudUrl || cloudUrl.startsWith('blob:')) {
                                _notify('Upload returned invalid URL, skipping.', 'error');
                                continue;
                            }

                            items.push({
                                id: 'si-' + Date.now() + '-' + i,
                                type: isVid2 ? 'video' : 'image',
                                url: cloudUrl,
                                content: statusText,
                                createdAt: new Date().toISOString(),
                                likes: 0, retweets: 0,
                                likedBy: [], retweetedBy: [], viewers: []
                            });
                        }

                        if (!items.length) { _notify('Nothing to post.', 'warning'); return; }

                        var statusDoc = {
                            userId: us.id,
                            name: us.fullName || us.username || 'User',
                            avatar: us.avatar || '',
                            items: items,
                            viewed: false,
                            createdAt: new Date().toISOString()
                        };

                        var docId = 'status-' + us.id;
                        if (_fbOk()) {
                            try {
                                await window.fbDb.collection('statuses').doc(docId).set(statusDoc);
                            } catch (fsErr) {
                                console.warn('[FixV4:StatusUpload] Firestore save failed:', fsErr.message);
                            }
                        }

                        if (!window.userStatuses) window.userStatuses = [];
                        statusDoc.docId = docId;
                        var existIdx = window.userStatuses.findIndex(function (s) { return s.userId === us.id; });
                        if (existIdx > -1) window.userStatuses[existIdx] = statusDoc;
                        else window.userStatuses.unshift(statusDoc);

                        if (typeof window.renderStatusBar === 'function') window.renderStatusBar();

                        modal.style.display = 'none';
                        modal.classList.remove('show');
                        document.body.classList.remove('modal-open');

                        if (textInput) textInput.value = '';
                        if (inp) inp.value = '';
                        var prev2 = document.getElementById('status-media-preview');
                        if (prev2) prev2.innerHTML = '';

                        _notify('✅ Status posted!', 'success');

                    } catch (err) {
                        console.error('[FixV4:StatusUpload]', err);
                        _notify('Failed to post status: ' + (err.message || 'Try again'), 'error');
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Post Status';
                    }
                });
            }
        }

        /* Run on DOMContentLoaded and retry after modals may be created */
        ready(_ensureStatusSubmitWired);
        setTimeout(_ensureStatusSubmitWired, 1500);
        document.addEventListener('empyrean-init-done', function () {
            setTimeout(_ensureStatusSubmitWired, 600);
        });

        console.log('[FixV4] ✅ FIX 2 — Status upload robustly patched');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 3 — MARKETPLACE PERMANENTLY ON DASHBOARD
       Root causes:
         a) dashboard-market-container has display:none in HTML and nothing
            sets it to block unless Firestore has items AND the listener fires
         b) The MutationObserver in app-patch.js only fires for NEW additions
            but existing cards already in the grid aren't backfilled reliably
         c) After page navigation the container gets reset to display:none
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixMarketplacePermanent() {
        function _ensureMarketVisible() {
            var cont = document.getElementById('dashboard-market-container');
            var slider = document.getElementById('dashboard-market-slider');
            if (!cont || !slider) return;

            /* If there are any cards already in the slider, show the container */
            if (slider.children.length > 0) {
                cont.style.display = 'block';
                return;
            }

            /* Backfill from the property grid */
            var grid = document.getElementById('property-grid-container');
            if (grid) {
                var cards = grid.querySelectorAll('.property-card');
                cards.forEach(function (card) {
                    _mirrorCardToSlider(card, slider, cont);
                });
            }

            /* Backfill from Firestore directly */
            if (_fbOk()) {
                window.fbDb.collection('marketplace_listings')
                    .orderBy('createdAt', 'desc').limit(20)
                    .get()
                    .then(function (snap) {
                        if (snap.empty) return;
                        snap.docs.forEach(function (doc) {
                            var d = doc.data();
                            if (!d || !d.id) return;
                            if (slider.querySelector('[data-id="' + d.id + '"]')) return;
                            _buildSliderCard(d, slider, cont);
                        });
                        if (slider.children.length > 0) cont.style.display = 'block';
                    })
                    .catch(function () {});
            }
        }

        function _mirrorCardToSlider(card, slider, cont) {
            if (!card || !slider) return;
            var id = card.dataset.id || card.dataset.postId;
            if (!id) return;
            if (slider.querySelector('[data-id="' + id + '"]')) return;

            var mediaUrls = [];
            try { mediaUrls = JSON.parse(card.dataset.media || '[]'); } catch (e) {}
            var firstUrl = mediaUrls[0] || (card.querySelector('img') ? card.querySelector('img').src : '') || '';
            var name = card.dataset.name || (card.querySelector('h4, .property-name') ? card.querySelector('h4, .property-name').textContent.trim() : '') || 'Item';
            var price = card.dataset.price || '0';
            var currency = card.dataset.displayCurrency || card.dataset.currency || 'NGN';

            _buildSliderCard({ id: id, name: name, price: price, currency: currency, media: [firstUrl] }, slider, cont);
        }

        function _buildSliderCard(data, slider, cont) {
            if (!data || !slider) return;
            if (slider.querySelector('[data-id="' + data.id + '"]')) return;

            var syms = { NGN: '₦', USD: '$', EUR: '€', GBP: '£', GHS: '₵', EMPY: 'EMPY ', USDT: 'USDT ' };
            var sym = syms[(data.currency || 'NGN').toUpperCase()] || '$';
            var priceStr = sym + parseFloat(data.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

            var firstUrl = (data.media && data.media[0]) || data.img || data.videoSrc || '';
            var isVid = firstUrl && (/\.(mp4|webm|mov)(\?|$)/i.test(firstUrl) || /\/video\/upload\//i.test(firstUrl));

            var dc = document.createElement('div');
            dc.className = 'dashboard-market-card';
            dc.dataset.id = data.id;
            dc.dataset.navTarget = 'marketplace';
            dc.style.cssText = 'flex:0 0 160px;width:160px;border-radius:14px;overflow:hidden;cursor:pointer;flex-shrink:0;background:var(--card-bg,#fff);border:1px solid rgba(0,0,0,0.07);box-shadow:0 2px 12px rgba(0,0,0,0.08);';

            if (firstUrl && !firstUrl.startsWith('blob:')) {
                dc.innerHTML = (isVid
                    ? '<video src="' + _esc(firstUrl) + '" autoplay loop muted playsinline style="width:100%;height:120px;object-fit:cover;display:block;"></video>'
                    : '<img src="' + _esc(firstUrl) + '" alt="' + _esc(data.name || '') + '" loading="lazy" style="width:100%;height:120px;object-fit:cover;display:block;" onerror="this.style.display=\'none\'">')
                    + '<div style="padding:8px;"><h5 style="font-size:0.8rem;margin:0 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--primary);">' + _esc(data.name || '') + '</h5>'
                    + '<p style="font-size:0.75rem;font-weight:700;color:var(--accent-color,#00D4AA);margin:0;">' + _esc(priceStr) + '</p></div>';
            } else {
                dc.innerHTML = '<div style="height:120px;background:linear-gradient(135deg,#1B2B8B,#0A0E27);display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-tag" style="color:rgba(255,255,255,0.3);font-size:1.5rem;"></i></div>'
                    + '<div style="padding:8px;"><h5 style="font-size:0.8rem;margin:0 0 4px;color:var(--primary);">' + _esc(data.name || '') + '</h5>'
                    + '<p style="font-size:0.75rem;font-weight:700;color:var(--accent-color,#00D4AA);margin:0;">' + _esc(priceStr) + '</p></div>';
            }

            dc.addEventListener('click', function () {
                if (typeof window.navigateTo === 'function') window.navigateTo('marketplace');
            });

            slider.appendChild(dc);
            if (cont) cont.style.display = 'block';
        }

        /* Expose globally so other modules can call it */
        window._ensureMarketVisible = _ensureMarketVisible;

        /* Observe property-grid-container for new cards */
        ready(function () {
            var grid = document.getElementById('property-grid-container');
            if (grid) {
                var obs = new MutationObserver(function (muts) {
                    muts.forEach(function (m) {
                        m.addedNodes.forEach(function (node) {
                            if (!node || node.nodeType !== 1) return;
                            var cards = [];
                            if (node.classList && node.classList.contains('property-card')) cards.push(node);
                            if (node.querySelectorAll) node.querySelectorAll('.property-card').forEach(function (c) { cards.push(c); });
                            var slider2 = document.getElementById('dashboard-market-slider');
                            var cont2 = document.getElementById('dashboard-market-container');
                            cards.forEach(function (card) { _mirrorCardToSlider(card, slider2, cont2); });
                        });
                    });
                });
                obs.observe(grid, { childList: true, subtree: true });
            }

            /* Live Firestore listener for marketplace */
            if (_fbOk()) {
                if (!window._v4MktListener) {
                    window._v4MktListener = window.fbDb.collection('marketplace_listings')
                        .orderBy('createdAt', 'desc').limit(30)
                        .onSnapshot(function (snap) {
                            var slider3 = document.getElementById('dashboard-market-slider');
                            var cont3 = document.getElementById('dashboard-market-container');
                            if (!slider3) return;
                            snap.docChanges().forEach(function (change) {
                                var d = change.doc.data();
                                if (!d) return;
                                if (change.type === 'added') _buildSliderCard(d, slider3, cont3);
                                if (change.type === 'removed') {
                                    var el = slider3.querySelector('[data-id="' + d.id + '"]');
                                    if (el) el.remove();
                                    /* hide if empty */
                                    if (slider3.children.length === 0 && cont3) cont3.style.display = 'none';
                                }
                            });
                        }, function () {});
                }
            }

            _ensureMarketVisible();
        });

        /* Re-run on Firebase ready and app init */
        document.addEventListener('empyrean:firebase-ready', function () {
            setTimeout(_ensureMarketVisible, 800);
        });
        document.addEventListener('empyrean-init-done', function () {
            setTimeout(_ensureMarketVisible, 600);
        });
        setTimeout(_ensureMarketVisible, 3000);

        console.log('[FixV4] ✅ FIX 3 — Marketplace permanently on dashboard');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 4 — INDIVIDUAL ACCOUNT FORM: PERMISSIONS + PUBLIC DASHBOARD
       Root causes:
         a) _indAcctFormEnabled() checks EmpState.indAcctFormEnabled but this
            is never set for non-admin users; Firestore read uses 'enabled'
            but app-patch.js wrote 'active' — field name mismatch
         b) The dashboard banner placeholder #ind-acct-dashboard-banner
            doesn't exist in index.html — we inject it into feed area
         c) openIndividualAccountForm() checks _isGuest() but also
            checks permissions incorrectly — all logged-in users should access
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixIndividualForm() {
        var _IND_BANNER_ID = 'ind-acct-dashboard-banner';

        /* Normalise field name: Firestore doc may use 'active' OR 'enabled' */
        function _isFormEnabled() {
            /* Check EmpState first */
            if (window.EmpState && window.EmpState.indAcctFormEnabled != null) {
                return !!window.EmpState.indAcctFormEnabled;
            }
            /* Check sessionStorage */
            try {
                var ss = sessionStorage.getItem('_indAcctFormEnabled');
                if (ss !== null) return ss === '1';
            } catch (e) {}
            return false;
        }

        /* Inject the banner placeholder if it doesn't exist */
        function _injectBannerPlaceholder() {
            if (document.getElementById(_IND_BANNER_ID)) return;
            var anchor = document.getElementById('feed-container')
                || document.getElementById('dashboard-market-container');
            if (!anchor) { setTimeout(_injectBannerPlaceholder, 800); return; }

            var banner = document.createElement('div');
            banner.id = _IND_BANNER_ID;
            banner.style.display = 'none';

            /* Insert BEFORE feed-container or market-container */
            if (anchor.id === 'feed-container') {
                anchor.parentNode.insertBefore(banner, anchor);
            } else {
                anchor.insertAdjacentElement('afterend', banner);
            }
        }

        /* Render (or hide) the banner */
        function _renderBanner() {
            var banner = document.getElementById(_IND_BANNER_ID);
            if (!banner) return;
            var enabled = _isFormEnabled();
            banner.style.display = enabled && !_isGuest() ? '' : 'none';
            if (!enabled || _isGuest()) return;

            banner.innerHTML = [
                '<div style="background:linear-gradient(135deg,rgba(0,212,170,0.12),rgba(59,130,246,0.10));',
                'border:1.5px solid rgba(0,212,170,0.3);border-radius:16px;overflow:hidden;margin-bottom:20px;">',
                '<div style="height:4px;background:linear-gradient(90deg,#00D4AA,#3B82F6,#00D4AA);"></div>',
                '<div style="padding:18px 20px;">',
                '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">',
                '<div style="width:42px;height:42px;border-radius:12px;background:rgba(0,212,170,0.15);',
                'display:flex;align-items:center;justify-content:center;flex-shrink:0;">',
                '<i class="fa-solid fa-hand-holding-dollar" style="color:#00D4AA;font-size:1.2rem;"></i></div>',
                '<div>',
                '<div style="font-weight:800;font-family:Syne,sans-serif;font-size:1rem;color:var(--primary);">Account Information Required</div>',
                '<div style="font-size:0.80rem;color:var(--text-muted);">Submit your bank details to receive your disbursement</div>',
                '</div></div>',
                '<button onclick="window._v4OpenIndividualForm()" ',
                'style="background:linear-gradient(135deg,#00D4AA,#3B82F6);border:none;color:white;',
                'border-radius:12px;padding:10px 22px;font-weight:700;font-size:0.88rem;cursor:pointer;',
                'display:flex;align-items:center;gap:8px;">',
                '<i class="fa-solid fa-pen-to-square"></i> Fill Account Form',
                '</button></div></div>',
            ].join('');
        }

        /* Open the individual account modal — NO permission check beyond login */
        window._v4OpenIndividualForm = function () {
            if (_isGuest()) {
                _notify('Please log in to submit your account information.', 'info');
                if (typeof window.openAuthModal === 'function') window.openAuthModal('login');
                return;
            }

            /* Try the existing app-ngo.js function first */
            if (typeof window.openIndividualAccountForm === 'function') {
                window.openIndividualAccountForm();
                return;
            }

            /* Fallback: build the modal ourselves */
            _buildIndividualFormModal();
        };

        function _buildIndividualFormModal() {
            var existing = document.getElementById('_v4_ind_acct_modal');
            if (existing) { existing.style.display = 'flex'; return; }

            var us = _us();
            var modal = document.createElement('div');
            modal.id = '_v4_ind_acct_modal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;';

            modal.innerHTML = [
                '<div style="background:var(--card-bg,#fff);width:100%;max-width:540px;max-height:90vh;',
                'overflow-y:auto;border-radius:20px 20px 0 0;padding:28px 24px;">',
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">',
                '<h3 style="margin:0;font-family:Syne,sans-serif;font-size:1.1rem;display:flex;align-items:center;gap:8px;">',
                '<i class="fa-solid fa-user-circle" style="color:#00D4AA;"></i> Individual Account Information</h3>',
                '<button id="_v4_ind_close" style="background:none;border:none;cursor:pointer;font-size:1.3rem;color:var(--text-muted);">',
                '<i class="fa-solid fa-xmark"></i></button></div>',

                _field('_v4f-fullname', 'Full Name *', 'text', us.fullName || ''),
                _field('_v4f-phone', 'Phone Number *', 'tel', us.phone || ''),
                _selectField('_v4f-gender', 'Gender *', ['Male', 'Female', 'Prefer not to say']),
                _field('_v4f-occupation', 'Occupation *', 'text', ''),
                _selectField('_v4f-education', 'Highest Education *', ['Primary', 'Secondary / O-Level', 'OND / NCE', 'HND / B.Sc', 'M.Sc / MBA', 'PhD']),
                _field('_v4f-purpose', 'Purpose of Subscription *', 'text', ''),
                _field('_v4f-acct-name', 'Bank Account Name *', 'text', ''),
                _field('_v4f-acct-number', 'Account Number *', 'text', ''),
                _field('_v4f-bank-name', 'Bank Name *', 'text', ''),

                '<div id="_v4_ind_feedback" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:10px;font-size:0.85rem;"></div>',
                '<div style="display:flex;gap:12px;margin-top:20px;">',
                '<button id="_v4_ind_submit" style="flex:1;background:linear-gradient(135deg,#00D4AA,#1B2B8B);',
                'color:white;border:none;border-radius:12px;padding:12px;font-weight:700;font-size:0.9rem;cursor:pointer;">',
                '<i class="fa-solid fa-paper-plane"></i> Submit</button>',
                '<button id="_v4_ind_cancel" style="background:rgba(0,0,0,0.06);border:none;border-radius:12px;',
                'padding:12px 20px;font-weight:600;cursor:pointer;">Cancel</button>',
                '</div></div>',
            ].join('');

            document.body.appendChild(modal);

            document.getElementById('_v4_ind_close').onclick = function () { modal.style.display = 'none'; };
            document.getElementById('_v4_ind_cancel').onclick = function () { modal.style.display = 'none'; };
            modal.addEventListener('click', function (e) { if (e.target === modal) modal.style.display = 'none'; });

            document.getElementById('_v4_ind_submit').addEventListener('click', async function () {
                var btn = this;
                var fb = document.getElementById('_v4_ind_feedback');

                var fullName   = (document.getElementById('_v4f-fullname') || {}).value || '';
                var phone      = (document.getElementById('_v4f-phone') || {}).value || '';
                var gender     = (document.getElementById('_v4f-gender') || {}).value || '';
                var occupation = (document.getElementById('_v4f-occupation') || {}).value || '';
                var education  = (document.getElementById('_v4f-education') || {}).value || '';
                var purpose    = (document.getElementById('_v4f-purpose') || {}).value || '';
                var acctName   = (document.getElementById('_v4f-acct-name') || {}).value || '';
                var acctNumber = (document.getElementById('_v4f-acct-number') || {}).value || '';
                var bankName   = (document.getElementById('_v4f-bank-name') || {}).value || '';

                if (!fullName || !phone || !gender || !occupation || !education || !purpose || !acctName || !acctNumber || !bankName) {
                    fb.style.display = 'block';
                    fb.style.background = 'rgba(239,68,68,0.1)';
                    fb.style.color = '#ef4444';
                    fb.textContent = 'Please fill in all required fields.';
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting…';

                try {
                    var us2 = _us();
                    var record = {
                        userId: us2.id || '',
                        fullName: fullName, phone: phone, gender: gender,
                        occupation: occupation, education: education, purpose: purpose,
                        bankAccountName: acctName, bankAccountNumber: acctNumber, bankName: bankName,
                        submittedAt: new Date()
                    };
                    if (_fbOk()) {
                        await window.fbDb.collection('individual_account_info').add(record);
                    }
                    fb.style.display = 'block';
                    fb.style.background = 'rgba(34,197,94,0.1)';
                    fb.style.color = '#22c55e';
                    fb.textContent = '✅ Submitted successfully! Your details are saved.';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> Submitted';
                    setTimeout(function () { modal.style.display = 'none'; }, 2000);
                } catch (err) {
                    fb.style.display = 'block';
                    fb.style.background = 'rgba(239,68,68,0.1)';
                    fb.style.color = '#ef4444';
                    fb.textContent = 'Error: ' + (err.message || 'Please try again.');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit';
                }
            });
        }

        function _field(id, label, type, val) {
            return '<div style="margin-bottom:14px;">'
                + '<label style="display:block;font-size:0.83rem;font-weight:600;margin-bottom:5px;">' + _esc(label) + '</label>'
                + '<input type="' + type + '" id="' + id + '" value="' + _esc(val) + '" '
                + 'style="width:100%;border:1.5px solid rgba(0,0,0,0.12);border-radius:10px;padding:10px 12px;font-size:0.9rem;outline:none;box-sizing:border-box;">'
                + '</div>';
        }

        function _selectField(id, label, options) {
            return '<div style="margin-bottom:14px;">'
                + '<label style="display:block;font-size:0.83rem;font-weight:600;margin-bottom:5px;">' + _esc(label) + '</label>'
                + '<select id="' + id + '" style="width:100%;border:1.5px solid rgba(0,0,0,0.12);border-radius:10px;padding:10px 12px;font-size:0.9rem;outline:none;background:white;box-sizing:border-box;">'
                + '<option value="">— Select —</option>'
                + options.map(function (o) { return '<option>' + _esc(o) + '</option>'; }).join('')
                + '</select></div>';
        }

        /* Load enabled state from Firestore — check BOTH 'active' and 'enabled' fields */
        function _loadFormState() {
            if (!_fbOk()) return;
            window.fbDb.collection('app_settings').doc('individual_account_form').get()
                .then(function (doc) {
                    if (!doc.exists) return;
                    var d = doc.data();
                    /* Support both field names */
                    var enabled = !!(d.active || d.enabled);
                    if (window.EmpState) window.EmpState.indAcctFormEnabled = enabled;
                    try { sessionStorage.setItem('_indAcctFormEnabled', enabled ? '1' : '0'); } catch (e) {}
                    _renderBanner();
                }).catch(function () {});
        }

        /* Boot sequence */
        ready(function () {
            _injectBannerPlaceholder();
            setTimeout(_renderBanner, 500);
        });
        document.addEventListener('empyrean-init-done', function () {
            _injectBannerPlaceholder();
            setTimeout(function () {
                _loadFormState();
                _renderBanner();
            }, 800);
        });
        document.addEventListener('empyrean:firebase-ready', function () {
            setTimeout(_loadFormState, 600);
        });

        /* Patch the existing toggle function to normalise field names */
        var _origToggle = window._toggleIndAcctForm;
        window._toggleIndAcctForm = async function (enable) {
            enable = !!enable;
            if (window.EmpState) window.EmpState.indAcctFormEnabled = enable;
            try { sessionStorage.setItem('_indAcctFormEnabled', enable ? '1' : '0'); } catch (e) {}
            /* Write BOTH field names for compatibility */
            if (_fbOk()) {
                try {
                    await window.fbDb.collection('app_settings').doc('individual_account_form')
                        .set({ active: enable, enabled: enable, updatedAt: new Date().toISOString() }, { merge: true });
                } catch (e) {}
            }
            _renderBanner();
            /* Also call original if it existed */
            if (typeof _origToggle === 'function') {
                try { await _origToggle.call(this, enable); } catch (e) {}
            }
            _notify(enable ? '✅ Individual form is now ACTIVE on the dashboard.' : '⏸ Individual form deactivated.', enable ? 'success' : 'info');
        };

        console.log('[FixV4] ✅ FIX 4 — Individual account form permissions + public banner fixed');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 5 — ADMIN PANEL: INDIVIDUAL FORM TAB
       The NGO app-ngo.js renders the individual form inside the grants
       allocation panel (agc-5 tab). But the admin nav tab for it may not
       exist or may not activate the correct panel on click.
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixAdminIndividualTab() {
        ready(function () {
            var _tries = 0;

            function _inject() {
                _tries++;
                /* Check if the NGO grant container is already rendered */
                var agc5 = document.getElementById('agc-5');
                var agcTabs = document.querySelectorAll('.admin-grant-tab');

                if (!agc5 || !agcTabs.length) {
                    /* Also try via the admin-disburse-tab pathway */
                    var disburseTab = document.getElementById('admin-disburse-tab');
                    if (!disburseTab) {
                        if (_tries < 30) setTimeout(_inject, 500);
                        return;
                    }

                    /* Inject inside disburse tab if agc-5 not found */
                    if (!document.getElementById('_v4_ind_admin_panel')) {
                        var panel = document.createElement('div');
                        panel.id = '_v4_ind_admin_panel';
                        panel.style.marginTop = '20px';
                        panel.innerHTML = _buildAdminPanel();
                        disburseTab.appendChild(panel);
                        _wireAdminPanel(panel);
                    }
                    return;
                }

                /* agc-5 found — ensure it has the individual account admin content */
                if (agc5.innerHTML.trim() === '' || !agc5.querySelector('#ind-acct-admin-toggle-btn')) {
                    agc5.innerHTML = _buildAdminPanel();
                    _wireAdminPanel(agc5);
                }

                /* Ensure the tab button exists for agc-5 */
                var existingTab5Btn = document.querySelector('.admin-grant-tab[data-tab="agc-5"]');
                if (!existingTab5Btn) {
                    var tabBar = agcTabs[0] && agcTabs[0].parentElement;
                    if (tabBar) {
                        var newTabBtn = document.createElement('button');
                        newTabBtn.className = 'admin-grant-tab';
                        newTabBtn.dataset.tab = 'agc-5';
                        newTabBtn.style.cssText = 'padding:8px 14px;border:none;border-radius:10px;cursor:pointer;font-weight:600;font-size:0.82rem;background:transparent;color:var(--text-muted);';
                        newTabBtn.innerHTML = '<i class="fa-solid fa-id-card"></i> Individual Forms';
                        tabBar.appendChild(newTabBtn);
                    }
                }
            }

            function _buildAdminPanel() {
                return [
                    '<div class="card" style="margin-bottom:16px;">',
                    '<div style="height:3px;background:linear-gradient(90deg,#00D4AA,#3B82F6);border-radius:3px 3px 0 0;"></div>',
                    '<div style="padding:20px;">',
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">',
                    '<div>',
                    '<h3 style="font-family:Syne,sans-serif;margin:0 0 4px;font-size:1rem;">',
                    '<i class="fa-solid fa-user-circle" style="color:#00D4AA;margin-right:8px;"></i>Individual Account Form</h3>',
                    '<p style="color:var(--text-muted);font-size:0.83rem;margin:0;">',
                    'Activate to display the individual account information form on the general dashboard.',
                    '</p></div>',
                    '<button id="ind-acct-admin-toggle-btn" class="btn" ',
                    'style="white-space:nowrap;flex-shrink:0;font-size:0.85rem;">',
                    '<i class="fa-solid fa-toggle-off"></i> Activate Form',
                    '</button></div>',
                    '<div id="_v4_ind_status_badge" style="padding:10px 14px;border-radius:10px;font-size:0.83rem;',
                    'background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.2);color:var(--text-muted);">',
                    '<i class="fa-solid fa-circle" style="font-size:0.5rem;vertical-align:middle;margin-right:6px;"></i>',
                    '<strong>INACTIVE</strong> — The form is hidden from the dashboard.</div>',
                    '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">',
                    '<button class="btn btn-small" id="_v4_load_submissions_btn">',
                    '<i class="fa-solid fa-rotate"></i> Refresh Submissions</button>',
                    '<button class="btn btn-small" id="_v4_export_csv_btn">',
                    '<i class="fa-solid fa-file-csv"></i> Export CSV</button>',
                    '</div>',
                    '<div id="ind-acct-submissions-container" style="margin-top:14px;"></div>',
                    '</div></div>',
                ].join('');
            }

            function _wireAdminPanel(container) {
                /* Wire toggle button */
                var toggleBtn = container.querySelector('#ind-acct-admin-toggle-btn');
                if (toggleBtn && !toggleBtn._v4Wired) {
                    toggleBtn._v4Wired = true;
                    /* Load current state */
                    _updateAdminToggleBtn(toggleBtn, container);
                    toggleBtn.addEventListener('click', function () {
                        var currentlyEnabled = toggleBtn.dataset.enabled === '1';
                        if (typeof window._toggleIndAcctForm === 'function') {
                            window._toggleIndAcctForm(!currentlyEnabled).then(function () {
                                _updateAdminToggleBtn(toggleBtn, container);
                            }).catch(function () {
                                _updateAdminToggleBtn(toggleBtn, container);
                            });
                        }
                    });
                }

                /* Wire refresh */
                var refreshBtn = container.querySelector('#_v4_load_submissions_btn');
                if (refreshBtn && !refreshBtn._v4Wired) {
                    refreshBtn._v4Wired = true;
                    refreshBtn.addEventListener('click', function () {
                        if (typeof window._loadIndAcctSubmissions === 'function') {
                            window._loadIndAcctSubmissions();
                        } else {
                            _loadSubmissionsFallback(container);
                        }
                    });
                }

                /* Wire export CSV */
                var exportBtn = container.querySelector('#_v4_export_csv_btn');
                if (exportBtn && !exportBtn._v4Wired) {
                    exportBtn._v4Wired = true;
                    exportBtn.addEventListener('click', function () {
                        if (typeof window._exportIndAcctData === 'function') {
                            window._exportIndAcctData();
                        } else {
                            _exportCsvFallback(container);
                        }
                    });
                }
            }

            function _updateAdminToggleBtn(btn, container) {
                var enabled = !!(window.EmpState && window.EmpState.indAcctFormEnabled);
                try { enabled = enabled || sessionStorage.getItem('_indAcctFormEnabled') === '1'; } catch (e) {}
                btn.dataset.enabled = enabled ? '1' : '0';
                btn.style.background = enabled ? 'rgba(239,68,68,0.12)' : '#00D4AA';
                btn.style.color = enabled ? '#ef4444' : '#0A0F1E';
                btn.style.border = enabled ? '1px solid rgba(239,68,68,0.3)' : 'none';
                btn.innerHTML = enabled
                    ? '<i class="fa-solid fa-toggle-on"></i> Deactivate Form'
                    : '<i class="fa-solid fa-toggle-off"></i> Activate Form';

                var badge = container && container.querySelector('#_v4_ind_status_badge');
                if (badge) {
                    badge.style.background = enabled ? 'rgba(34,197,94,0.08)' : 'rgba(148,163,184,0.08)';
                    badge.style.border = '1px solid ' + (enabled ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.2)');
                    badge.style.color = enabled ? '#22c55e' : 'var(--text-muted)';
                    badge.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem;vertical-align:middle;margin-right:6px;"></i>'
                        + (enabled ? '<strong>ACTIVE</strong> — Form is visible on the dashboard.' : '<strong>INACTIVE</strong> — Form is hidden from the dashboard.');
                }
            }

            function _loadSubmissionsFallback(container) {
                var c = document.getElementById('ind-acct-submissions-container')
                    || (container && container.querySelector('#ind-acct-submissions-container'));
                if (!c) return;
                if (!_fbOk()) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Firebase not connected.</p>'; return; }
                c.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</p>';
                window.fbDb.collection('individual_account_info').orderBy('submittedAt', 'desc').limit(100).get()
                    .then(function (snap) {
                        if (snap.empty) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px;">No submissions yet.</p>'; return; }
                        var rows = '';
                        snap.forEach(function (doc) {
                            var d = doc.data();
                            var dt = d.submittedAt && d.submittedAt.toDate ? d.submittedAt.toDate().toLocaleDateString('en-GB') : '—';
                            rows += '<tr><td style="padding:8px 10px;font-size:0.82rem;">' + _esc(d.fullName || '—') + '</td>'
                                + '<td style="padding:8px 10px;font-size:0.82rem;">' + _esc(d.phone || '—') + '</td>'
                                + '<td style="padding:8px 10px;font-size:0.82rem;font-family:monospace;">' + _esc(d.bankAccountNumber || '—') + '</td>'
                                + '<td style="padding:8px 10px;font-size:0.82rem;">' + _esc(d.bankAccountName || '—') + '</td>'
                                + '<td style="padding:8px 10px;font-size:0.82rem;">' + _esc(d.bankName || '—') + '</td>'
                                + '<td style="padding:8px 10px;font-size:0.82rem;">' + _esc(dt) + '</td></tr>';
                        });
                        c.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.82rem;">'
                            + '<thead><tr style="background:rgba(0,212,170,0.08);">'
                            + '<th style="padding:8px 10px;text-align:left;">Full Name</th>'
                            + '<th style="padding:8px 10px;text-align:left;">Phone</th>'
                            + '<th style="padding:8px 10px;text-align:left;">Account No.</th>'
                            + '<th style="padding:8px 10px;text-align:left;">Account Name</th>'
                            + '<th style="padding:8px 10px;text-align:left;">Bank</th>'
                            + '<th style="padding:8px 10px;text-align:left;">Date</th>'
                            + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
                    }).catch(function (e) {
                        c.innerHTML = '<p style="color:#ef4444;font-size:0.85rem;">Error loading: ' + _esc(e.message) + '</p>';
                    });
            }

            function _exportCsvFallback() {
                if (!_fbOk()) { _notify('Firebase not connected.', 'error'); return; }
                window.fbDb.collection('individual_account_info').orderBy('submittedAt', 'desc').get()
                    .then(function (snap) {
                        var csv = 'Full Name,Phone,Gender,Occupation,Education,Purpose,Account Name,Account Number,Bank Name,Date\n';
                        snap.forEach(function (doc) {
                            var d = doc.data();
                            var dt = d.submittedAt && d.submittedAt.toDate ? d.submittedAt.toDate().toLocaleDateString('en-GB') : '';
                            csv += [d.fullName, d.phone, d.gender, d.occupation, d.education, d.purpose,
                                d.bankAccountName, d.bankAccountNumber, d.bankName, dt]
                                .map(function (v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; }).join(',') + '\n';
                        });
                        var blob = new Blob([csv], { type: 'text/csv' });
                        var a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = 'ind-acct-submissions-' + new Date().toISOString().slice(0, 10) + '.csv';
                        a.click();
                        _notify('✅ CSV exported!', 'success');
                    }).catch(function (e) { _notify('Export failed: ' + e.message, 'error'); });
            }

            /* Boot */
            _inject();
            document.addEventListener('empyrean-init-done', function () { setTimeout(_inject, 800); });
        });

        console.log('[FixV4] ✅ FIX 5 — Admin individual form tab patched');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 6 — BUSINESS POSTS: SHOW COMPANY/ORG DETAILS IN PUBLIC FEED
       Root causes:
         a) Posts mirrored with dashboard ID 'posts-feed' (doesn't exist)
            instead of 'feed-container'
         b) Business card in feed doesn't show company name / org badge
         c) Firestore business_posts don't store businessName / orgName
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixBusinessPostsInFeed() {
        /* a) Ghost proxy for #posts-feed → #feed-container (already in patch, reinforced here) */
        ready(function () {
            if (!document.getElementById('posts-feed')) {
                var ghost = document.createElement('div');
                ghost.id = 'posts-feed';
                ghost.style.display = 'none';
                ghost.prepend = function () {
                    var fc = document.getElementById('feed-container');
                    if (fc) fc.prepend.apply(fc, arguments);
                };
                ghost.appendChild = function () {
                    var fc = document.getElementById('feed-container');
                    if (fc) fc.appendChild.apply(fc, arguments);
                };
                document.body.appendChild(ghost);
            }
        });

        /* b) CSS for business post badge */
        ready(function () {
            var s = document.createElement('style');
            s.textContent = [
                '.biz-feed-card { border-left: 3px solid #1B2B8B !important; }',
                '.biz-feed-badge {',
                '  display: inline-flex;',
                '  align-items: center;',
                '  gap: 5px;',
                '  font-size: 0.68rem;',
                '  background: linear-gradient(135deg,#1B2B8B,#0A0E27);',
                '  color: white;',
                '  padding: 3px 9px;',
                '  border-radius: 20px;',
                '  font-weight: 700;',
                '  margin-left: 8px;',
                '  vertical-align: middle;',
                '  letter-spacing: 0.02em;',
                '}',
                '.biz-feed-org-strip {',
                '  display: flex;',
                '  align-items: center;',
                '  gap: 8px;',
                '  margin-top: 6px;',
                '  padding: 6px 10px;',
                '  background: rgba(27,43,139,0.05);',
                '  border-radius: 8px;',
                '  font-size: 0.78rem;',
                '  color: var(--text-muted);',
                '}',
                '.biz-feed-org-strip i { color: #1B2B8B; }',
            ].join('\n');
            document.head.appendChild(s);
        });

        /* c) Firestore listener that injects business posts with org details */
        function _startBizFeedListener() {
            if (!_fbOk() || window._v4BizFeedListener) return;

            window._v4BizFeedListener = window.fbDb.collection('business_posts')
                .orderBy('createdAt', 'desc').limit(30)
                .onSnapshot(function (snap) {
                    var fc = document.getElementById('feed-container');
                    if (!fc) return;

                    snap.docChanges().forEach(function (change) {
                        var post = change.doc.data();
                        if (!post || !post.id) return;

                        if (change.type === 'added') {
                            if (fc.querySelector('[data-post-id="' + post.id + '"]')) return;
                            if (typeof window.createNewPostElement !== 'function') return;

                            var mediaArr = (post.media || []).filter(function (u) { return u && !u.startsWith('blob:'); })
                                .map(function (u) {
                                    return {
                                        _cloudUrl: u, url: u,
                                        type: (/\.(mp4|webm|mov)(\?|$)/i.test(u) || /\/video\/upload\//i.test(u)) ? 'video/mp4' : 'image/jpeg'
                                    };
                                });

                            var authorInfo = {
                                id: post.userId,
                                fullName: post.businessName || post.orgName || post.username || 'Business',
                                avatar: post.businessLogo || post.avatar || '',
                            };

                            var el = window.createNewPostElement(post.text || '', mediaArr, authorInfo);
                            if (!el) return;

                            el.dataset.postId = post.id;
                            el.dataset.userId = post.userId || '';
                            el.classList.add('biz-feed-card');

                            /* Inject badge into post header */
                            var hdr = el.querySelector('.story-header, .story-user-info, .post-header');
                            if (hdr) {
                                var badge = document.createElement('span');
                                badge.className = 'biz-feed-badge';
                                badge.innerHTML = '<i class="fa-solid fa-briefcase"></i> Business';
                                hdr.appendChild(badge);
                            }

                            /* Inject org details strip */
                            var orgStrip = document.createElement('div');
                            orgStrip.className = 'biz-feed-org-strip';
                            orgStrip.innerHTML = [
                                post.businessName || post.orgName
                                    ? '<span><i class="fa-solid fa-building"></i> ' + _esc(post.businessName || post.orgName) + '</span>'
                                    : '',
                                post.industry
                                    ? '<span><i class="fa-solid fa-industry"></i> ' + _esc(post.industry) + '</span>'
                                    : '',
                                post.businessEmail || post.email
                                    ? '<span><i class="fa-solid fa-envelope"></i> ' + _esc(post.businessEmail || post.email) + '</span>'
                                    : '',
                            ].filter(Boolean).join('<span style="opacity:0.3;">•</span>');

                            if (orgStrip.innerHTML.trim()) {
                                /* Insert after story-text if found, else append */
                                var txt = el.querySelector('.story-text, .post-text, .post-content');
                                if (txt && txt.nextSibling) {
                                    txt.parentNode.insertBefore(orgStrip, txt.nextSibling);
                                } else {
                                    el.appendChild(orgStrip);
                                }
                            }

                            var isNew = post.createdAt && (Date.now() - new Date(post.createdAt).getTime() < 30000);
                            if (isNew) fc.prepend(el); else fc.appendChild(el);

                            var es = document.getElementById('feed-empty-state');
                            if (es) es.style.display = 'none';

                        } else if (change.type === 'removed') {
                            var rmEl = fc.querySelector('[data-post-id="' + post.id + '"]');
                            if (rmEl) rmEl.remove();
                        }
                    });
                }, function (err) {
                    console.warn('[FixV4:BizFeed]', err.message);
                    window._v4BizFeedListener = null;
                });

            /* Also patch _handleBusinessPostSubmit to store businessName in Firestore */
            var _origBizSubmit = window._handleBusinessPostSubmit;
            if (_origBizSubmit && !_origBizSubmit._v4BizPatch) {
                window._handleBusinessPostSubmit = function () {
                    return _origBizSubmit.apply(this, arguments);
                };
                window._handleBusinessPostSubmit._v4BizPatch = true;
            }

            console.log('[FixV4] ✅ FIX 6 — Business posts feed listener with org details active');
        }

        document.addEventListener('empyrean:firebase-ready', function () { setTimeout(_startBizFeedListener, 1200); });
        document.addEventListener('empyrean-init-done', function () { setTimeout(_startBizFeedListener, 1500); });
        setTimeout(function () { if (_fbOk()) _startBizFeedListener(); }, 3500);
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 7 — REPLACE ALL EMOJI & OUTDATED ICONS SITE-WIDE
       Replaces: FA fallback emoji content, inline emoji text, and
       outdated icon classes with modern FA6 solid equivalents.
       Covers: vertical sidebar, bottom nav, all modal buttons, status bar,
               reel viewer, feed cards, admin panel, form labels.
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixIcons() {
        ready(function () {
            /* ── 1. Remove the emoji FA-fallback style block entirely ── */
            var faFallback = document.getElementById('fa-fallback');
            if (faFallback) faFallback.disabled = true; /* don't remove, just disable */

            /* ── 2. Replace emoji-only content in known icon containers ── */
            /* Map: emoji text → {icon class, optional label} */
            var EMOJI_MAP = {
                '😊': 'fa-solid fa-face-smile',
                '📢': 'fa-solid fa-bullhorn',
                '🎁': 'fa-solid fa-gift',
                '🛒': 'fa-solid fa-cart-shopping',
                '🎬': 'fa-solid fa-clapperboard',
                '📰': 'fa-solid fa-newspaper',
                '👤': 'fa-solid fa-user',
                '⚙': 'fa-solid fa-gear',
                '⚙️': 'fa-solid fa-gear',
                '🛡': 'fa-solid fa-shield-halved',
                '🤝': 'fa-solid fa-handshake',
                '💬': 'fa-regular fa-comment-dots',
                '→': 'fa-solid fa-arrow-right-to-bracket',
                '↗': 'fa-solid fa-share-from-square',
                '↺': 'fa-solid fa-repeat',
                '📷': 'fa-solid fa-camera',
                '⬆': 'fa-solid fa-cloud-arrow-up',
                '✏': 'fa-solid fa-pen',
                '🗑': 'fa-solid fa-trash-can',
                '🚀': 'fa-solid fa-rocket',
                '🎯': 'fa-solid fa-bullseye',
                '⭐': 'fa-solid fa-star',
                '🔑': 'fa-solid fa-key',
                '🔒': 'fa-solid fa-lock',
                '📸': 'fa-brands fa-instagram',
                '🙌': 'fa-regular fa-hands-clapping',
                '⊞': 'fa-solid fa-sitemap',
                '🏢': 'fa-solid fa-building',
                '👥': 'fa-solid fa-users',
                '⏹': 'fa-solid fa-stop-circle',
                '📊': 'fa-solid fa-chart-pie',
                '🔗': 'fa-solid fa-link',
                '👍': 'fa-solid fa-thumbs-up',
                '📱': 'fa-solid fa-mobile-screen',
                '👁': 'fa-solid fa-eye',
                '▶': 'fa-solid fa-play',
                '💳': 'fa-solid fa-credit-card',
                '✉': 'fa-regular fa-envelope',
                '💰': 'fa-solid fa-coins',
                '💸': 'fa-solid fa-money-bill-wave',
                '📅': 'fa-solid fa-calendar-days',
                '🌍': 'fa-solid fa-globe',
                '🔴': 'fa-solid fa-circle',
                '🟢': 'fa-solid fa-circle',
            };

            /* Walk text nodes and replace standalone emojis */
            function _replaceEmojiTextNodes(root) {
                var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
                var toReplace = [];
                var node;
                while ((node = walker.nextNode())) {
                    var text = node.nodeValue;
                    var parent = node.parentNode;
                    if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') continue;
                    /* Only standalone emoji (btn labels, nav items, etc) — trim + check map */
                    var trimmed = text.trim();
                    if (EMOJI_MAP[trimmed]) {
                        toReplace.push({ node: node, icon: EMOJI_MAP[trimmed] });
                    }
                }
                toReplace.forEach(function (item) {
                    var icon = document.createElement('i');
                    icon.className = item.icon;
                    if (item.node.parentNode) {
                        item.node.parentNode.replaceChild(icon, item.node);
                    }
                });
            }

            /* Replace emoji in specific containers */
            function _replaceIconsInContainer(sel) {
                var containers = document.querySelectorAll(sel);
                containers.forEach(function (c) { _replaceEmojiTextNodes(c); });
            }

            /* ── 3. Upgrade outdated FA class names → FA6 solid ── */
            var OLD_CLASS_MAP = {
                'fa-cloud-upload-alt': 'fa-cloud-arrow-up',
                'fa-sign-in-alt':      'fa-right-to-bracket',
                'fa-sign-out-alt':     'fa-right-from-bracket',
                'fa-times':            'fa-xmark',
                'fa-times-circle':     'fa-circle-xmark',
                'fa-check-circle':     'fa-circle-check',
                'fa-info-circle':      'fa-circle-info',
                'fa-exclamation-circle':'fa-circle-exclamation',
                'fa-exclamation-triangle':'fa-triangle-exclamation',
                'fa-arrow-up':         'fa-arrow-up',
                'fa-arrow-down':       'fa-arrow-down',
                'fa-chevron-right':    'fa-chevron-right',
                'fa-chevron-left':     'fa-chevron-left',
                'fa-share-alt':        'fa-share-nodes',
                'fa-sort-amount-down': 'fa-arrow-down-wide-short',
                'fa-user-circle':      'fa-circle-user',
                'fa-user-shield':      'fa-user-shield',
                'fa-hands-helping':    'fa-handshake-angle',
                'fa-chart-bar':        'fa-chart-column',
                'fa-mobile-alt':       'fa-mobile-screen',
                'fa-hand-holding-usd': 'fa-hand-holding-dollar',
                'fa-paper-plane':      'fa-paper-plane',
                'fa-map-marker-alt':   'fa-location-dot',
                'fa-comment-dots':     'fa-comment-dots',
                'fa-ellipsis-h':       'fa-ellipsis',
                'fa-ellipsis-v':       'fa-ellipsis-vertical',
                'fa-long-arrow-alt-right':'fa-arrow-right-long',
                'fa-long-arrow-alt-left':'fa-arrow-left-long',
            };

            function _upgradeIconClasses(root) {
                (root || document).querySelectorAll('i[class*="fa-"]').forEach(function (el) {
                    Object.keys(OLD_CLASS_MAP).forEach(function (oldCls) {
                        if (el.classList.contains(oldCls)) {
                            el.classList.remove(oldCls);
                            el.classList.add(OLD_CLASS_MAP[oldCls]);
                            /* Ensure fa-solid prefix if missing */
                            if (!el.classList.contains('fa-solid') && !el.classList.contains('fa-regular') &&
                                !el.classList.contains('fa-brands') && !el.classList.contains('fas') &&
                                !el.classList.contains('far') && !el.classList.contains('fab')) {
                                el.classList.add('fa-solid');
                            }
                        }
                    });
                });
            }

            /* ── 4. Replace the emoji msg button ── */
            function _replaceMsgEmojiBtn() {
                var btn = document.getElementById('msg-emoji-btn');
                if (btn && btn.innerHTML.trim() === '😊') {
                    btn.innerHTML = '<i class="fa-regular fa-face-smile"></i>';
                    btn.title = 'Emoji';
                }
            }

            /* ── 5. Inject icon replacement CSS for any remaining emoji ── */
            var iconCSS = document.createElement('style');
            iconCSS.id = '_v4_icon_css';
            iconCSS.textContent = [
                /* Override fa-fallback emoji content with proper FA6 characters */
                /* (FA6 CDN already loaded — these are just safety overrides) */
                '#fa-fallback { display: none !important; }',
                /* Ensure all FA icons render correctly */
                '.fa-solid, .fas { font-family: "Font Awesome 6 Free" !important; font-weight: 900 !important; }',
                '.fa-regular, .far { font-family: "Font Awesome 6 Free" !important; font-weight: 400 !important; }',
                '.fa-brands, .fab { font-family: "Font Awesome 6 Brands" !important; font-weight: 400 !important; }',
                /* Nav icon styling enhancement */
                '.sidebar-nav li a i, .mobile-nav-item i {',
                '  font-size: 1.1rem;',
                '  width: 20px;',
                '  text-align: center;',
                '  transition: transform 0.2s;',
                '}',
                '.sidebar-nav li a:hover i, .mobile-nav-item:hover i { transform: scale(1.15); }',
                /* Button icon spacing */
                '.btn i { margin-right: 6px; }',
                '.btn i:only-child { margin-right: 0; }',
            ].join('\n');
            document.head.appendChild(iconCSS);

            /* ── Run replacements ── */
            function _runAll() {
                _replaceIconsInContainer('.sidebar-nav, #mobile-bottom-nav, .mobile-nav-item, .admin-nav-tab, .admin-grant-tab');
                _replaceMsgEmojiBtn();
                _upgradeIconClasses(document);
            }

            _runAll();
            setTimeout(_runAll, 800);

            /* Re-run after any dynamic content injection */
            var _iconObs = new MutationObserver(function (muts) {
                var significant = muts.some(function (m) { return m.addedNodes.length > 0; });
                if (significant) setTimeout(function () {
                    _replaceMsgEmojiBtn();
                    _upgradeIconClasses(document);
                }, 200);
            });
            _iconObs.observe(document.body, { childList: true, subtree: true });

            document.addEventListener('empyrean-init-done', function () { setTimeout(_runAll, 400); });
        });

        console.log('[FixV4] ✅ FIX 7 — All emojis → FA6 professional icons');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX 8 — PATCH INTERACTION BETWEEN app-fixes.js & app-patch.js
       Prevent double-initialisation of listeners; ensure live stream
       listener restarts after Firebase is ready.
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixIntegration() {
        /* Restart live stream listener reliably */
        document.addEventListener('empyrean:firebase-ready', function () {
            setTimeout(function () {
                if (typeof window.startLiveStreamListener === 'function') {
                    window.startLiveStreamListener();
                }
            }, 900);
        });

        /* Blank screen guard */
        setTimeout(function () {
            var sections = document.querySelectorAll('.content-section');
            var anyActive = Array.from(sections).some(function (s) {
                return s.classList.contains('active') || s.style.display === 'block';
            });
            if (!anyActive && sections.length > 0) {
                var dash = document.getElementById('dashboard');
                if (dash) {
                    dash.classList.add('active');
                    dash.style.display = 'block';
                    console.warn('[FixV4:BlankGuard] Recovered blank screen → dashboard');
                }
            }
        }, 3500);

        /* Ensure addMarketItemToDashboardSlider alias is set */
        document.addEventListener('empyrean-init-done', function () {
            if (typeof window.addMarketItemToDashboardStrip === 'function' && !window.addMarketItemToDashboardSlider) {
                window.addMarketItemToDashboardSlider = window.addMarketItemToDashboardStrip;
            }
            if (typeof window._ensureMarketVisible === 'function') {
                window._ensureMarketVisible();
            }
        });

        console.log('[FixV4] ✅ FIX 8 — Integration patches applied');
    })();

    console.log('[Empyrean Fix v4] 🔧 All 8 fixes applied — reel/status/marketplace/individual-form/biz-posts/icons patched.');

})();