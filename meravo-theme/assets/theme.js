/*
 * MERAVO theme behaviour.
 *
 * Everything here builds on markup that already works without it: the
 * product form posts to /cart/add, the cart's buttons are links to
 * /cart/change, and "Load more" is a link to the next page. This file makes
 * them happen in place, with the animations the React storefront had.
 *
 * Settings and strings come from window.meravo, written by
 * layout/theme.liquid.
 */
(function () {
  'use strict';

  var config = window.meravo || {};
  var routes = config.routes || {};
  var strings = config.strings || {};
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Strings for JS use [name] placeholders, because {{ name }} in a locale
  // file is interpolated by Shopify's own t filter before it gets here.
  function t(key, values) {
    var text = strings[key] || key;
    Object.keys(values || {}).forEach(function (name) {
      text = text.split('[' + name + ']').join(values[name]);
    });
    return text;
  }

  function on(root, event, selector, handler) {
    root.addEventListener(event, function (e) {
      var target = e.target.closest(selector);
      if (target && root.contains(target)) handler(e, target);
    });
  }

  /* ---------------------------------------------------------------- money */

  function formatMoney(cents) {
    var format = config.moneyFormat || '{{amount}}';
    var value = Number(cents) || 0;

    function group(number, decimals, thousands, decimal) {
      var fixed = (number / 100).toFixed(decimals);
      var parts = fixed.split('.');
      parts[0] = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + thousands);
      return parts[1] ? parts[0] + decimal + parts[1] : parts[0];
    }

    return format.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, kind) {
      switch (kind) {
        case 'amount_no_decimals':
          return group(value, 0, ',', '.');
        case 'amount_with_comma_separator':
          return group(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return group(value, 0, '.', ',');
        case 'amount_with_space_separator':
          return group(value, 2, ' ', ',');
        case 'amount_with_apostrophe_separator':
          return group(value, 2, "'", '.');
        default:
          return group(value, 2, ',', '.');
      }
    });
  }

  /* --------------------------------------------------------------- toasts */

  var toastIcons = {
    success:
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>',
    error:
      '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.007v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  };

  function showToast(message, variant) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    variant = variant === 'error' ? 'error' : 'success';
    var toast = document.createElement('div');
    toast.className =
      'toast pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white shadow-lg ' +
      (variant === 'success' ? 'bg-maroon-800' : 'bg-red-600');
    toast.innerHTML = toastIcons[variant];
    toast.appendChild(document.createTextNode(message));
    region.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('is-leaving');
      setTimeout(function () {
        toast.remove();
      }, 220);
    }, 2600);
  }

  /* ------------------------------------------------------ scroll reveals */

  var revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-revealed');
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { rootMargin: '0px 0px -40px 0px' }
        )
      : null;

  function initReveals(root) {
    root.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach(function (el) {
      if (!revealObserver || reduceMotion || config.revealEnabled === false) {
        el.classList.add('is-revealed');
      } else {
        revealObserver.observe(el);
      }
    });
  }

  /* ------------------------------------------------------------------ cart */

  function cartRequest(url, body) {
    var isForm = body instanceof FormData;
    return fetch(url, {
      method: 'POST',
      headers: isForm
        ? { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var error = new Error(data.description || data.message || t('cart_error'));
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  function refreshCartCount() {
    return fetch(routes.cart_url + '.js', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.json();
      })
      .then(function (cart) {
        setCartCount(cart.item_count);
        return cart;
      });
  }

  function setCartCount(count) {
    document.querySelectorAll('[data-cart-link]').forEach(function (link) {
      var label = count === 1 ? t('cart_count_one') : t('cart_count', { count: count });
      link.setAttribute('aria-label', count > 0 ? label : t('cart'));
    });
    document.querySelectorAll('[data-cart-count]').forEach(function (bubble) {
      var hadItems = !bubble.hidden;
      bubble.textContent = count;
      bubble.hidden = count === 0;
      if (count > 0 && !hadItems) {
        bubble.classList.remove('pop-in');
        void bubble.offsetWidth;
        bubble.classList.add('pop-in');
      }
    });
  }

  function addedToCart(title) {
    showToast(t('added_to_cart', { title: title }));
    document.dispatchEvent(new CustomEvent('meravo:cart-added'));
    refreshCartCount();
  }

  /* Plus button on product cards: adds one of the product's only variant. */
  on(document, 'click', '[data-quick-add]', function (event, button) {
    event.preventDefault();
    if (button.disabled) return;
    var spinner = button.querySelector('[data-spinner]');
    var icon = button.querySelector('[data-icon]');
    button.disabled = true;
    if (spinner) spinner.hidden = false;
    if (icon) icon.hidden = true;
    cartRequest(routes.cart_add_url + '.js', { items: [{ id: Number(button.dataset.variantId), quantity: 1 }] })
      .then(function () {
        addedToCart(button.dataset.productTitle);
      })
      .catch(function (error) {
        showToast(error.message || t('add_error'), 'error');
      })
      .finally(function () {
        button.disabled = false;
        if (spinner) spinner.hidden = true;
        if (icon) icon.hidden = false;
      });
  });

  /* ------------------------------------------------------- product page */

  function initProduct(root) {
    root.querySelectorAll('[data-product]').forEach(function (product) {
      if (product.dataset.ready) return;
      product.dataset.ready = '1';

      var form = product.querySelector('form[data-product-form]');
      var variantsEl = product.querySelector('[data-variants]');
      var variants = variantsEl ? JSON.parse(variantsEl.textContent) : [];
      var idInput = form && form.querySelector('[name="id"]');
      var qtyInput = form && form.querySelector('[name="quantity"]');
      var submit = form && form.querySelector('[data-add-button]');
      var label = submit && submit.querySelector('[data-add-label]');

      function currentVariant() {
        var id = idInput ? Number(idInput.value) : null;
        return variants.find(function (v) { return v.id === id; }) || null;
      }

      function maxQuantity() {
        var variant = currentVariant();
        if (variant && variant.inventory_management === 'shopify' && variant.inventory_policy === 'deny') {
          return Math.max(1, variant.inventory_quantity);
        }
        return 9999;
      }

      function renderVariant(variant) {
        var price = product.querySelector('[data-price]');
        var compare = product.querySelector('[data-compare-price]');
        var stock = product.querySelector('[data-stock]');
        if (!variant) {
          if (submit) submit.disabled = true;
          if (label) label.textContent = t('unavailable');
          if (stock) stock.textContent = t('unavailable');
          return;
        }
        if (idInput) idInput.value = variant.id;
        if (price) price.textContent = formatMoney(variant.price);
        if (compare) {
          compare.hidden = !(variant.compare_at_price > variant.price);
          compare.textContent = variant.compare_at_price ? formatMoney(variant.compare_at_price) : '';
        }
        if (stock) {
          if (!variant.available) {
            stock.textContent = t('out_of_stock');
          } else if (variant.inventory_management === 'shopify' && variant.inventory_quantity > 0) {
            stock.textContent = t('in_stock_count', { count: variant.inventory_quantity });
          } else {
            stock.textContent = t('in_stock');
          }
        }
        if (submit) submit.disabled = !variant.available;
        if (label) label.textContent = variant.available ? t('add_to_cart') : t('sold_out');
        if (qtyInput && Number(qtyInput.value) > maxQuantity()) qtyInput.value = maxQuantity();
        if (variant.featured_media) {
          var viewer = product.querySelector('[data-viewer]');
          if (viewer) showMedia(viewer, variant.featured_media.id);
        }
        if (product.dataset.updateUrl) {
          var url = new URL(window.location.href);
          url.searchParams.set('variant', variant.id);
          window.history.replaceState({}, '', url.toString());
        }
      }

      product.addEventListener('change', function (event) {
        if (!event.target.matches('[data-option]')) return;
        var chosen = Array.prototype.map.call(
          product.querySelectorAll('[data-option-group]'),
          function (group) {
            var checked = group.querySelector('[data-option]:checked');
            return checked ? checked.value : null;
          }
        );
        var match = variants.find(function (variant) {
          return variant.options.every(function (value, i) { return value === chosen[i]; });
        });
        renderVariant(match || null);
      });

      product.addEventListener('click', function (event) {
        var step = event.target.closest('[data-qty-step]');
        if (!step || !qtyInput) return;
        event.preventDefault();
        var next = (Number(qtyInput.value) || 1) + Number(step.dataset.qtyStep);
        qtyInput.value = Math.min(maxQuantity(), Math.max(1, next));
      });

      if (form) {
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          if (!submit || submit.disabled) return;
          var idle = label ? label.textContent : '';
          submit.disabled = true;
          if (label) label.textContent = t('adding');
          cartRequest(routes.cart_add_url + '.js', new FormData(form))
            .then(function () {
              if (label) label.textContent = t('added');
              addedToCart(product.dataset.productTitle);
              setTimeout(function () {
                if (label) label.textContent = idle;
                submit.disabled = false;
              }, 1800);
            })
            .catch(function (error) {
              showToast(error.message || t('add_error'), 'error');
              if (label) label.textContent = idle;
              submit.disabled = false;
            });
        });
      }

      product.querySelectorAll('[data-viewer]').forEach(initViewer);

      on(product, 'click', '[data-thumb]', function (event, thumb) {
        var viewer = product.querySelector('[data-viewer]');
        if (viewer) showMedia(viewer, thumb.dataset.thumb);
      });

      product.querySelectorAll('[data-video]').forEach(initVideo);
    });
  }

  function showMedia(viewer, mediaId) {
    var image = viewer.querySelector('img');
    var source = document.querySelector('[data-media-source="' + mediaId + '"]');
    if (!image || !source) return;
    image.src = source.dataset.src;
    image.srcset = source.dataset.srcset || '';
    image.removeAttribute('width');
    image.removeAttribute('height');
    image.alt = source.dataset.alt || image.alt;
    document.querySelectorAll('[data-thumb]').forEach(function (thumb) {
      var active = thumb.dataset.thumb === String(mediaId);
      thumb.setAttribute('aria-current', active ? 'true' : 'false');
      thumb.classList.toggle('ring-2', active);
      thumb.classList.toggle('ring-maroon-600', active);
    });
  }

  /* Tilt viewer (one photo) and drag-to-rotate (360 frames). */
  function initViewer(viewer) {
    var hint = viewer.querySelector('.viewer-hint');
    var image = viewer.querySelector('img');
    var interacted = false;
    function touched() {
      if (interacted) return;
      interacted = true;
      if (hint) hint.classList.add('is-hidden');
    }

    if (viewer.dataset.viewer === 'sequence') {
      var framesEl = viewer.querySelector('[data-frames]');
      var frames = framesEl ? JSON.parse(framesEl.textContent) : [];
      if (frames.length < 2 || !image) return;
      frames.forEach(function (src) { new Image().src = src; });
      var index = 0;
      var timer = reduceMotion
        ? null
        : setInterval(function () {
            index = (index + 1) % frames.length;
            image.src = frames[index];
          }, 90);
      var dragging = false;
      var startX = 0;
      var startFrame = 0;
      viewer.addEventListener('pointerdown', function (e) {
        viewer.setPointerCapture(e.pointerId);
        dragging = true;
        startX = e.clientX;
        startFrame = index;
        if (timer) clearInterval(timer);
        timer = null;
        touched();
      });
      viewer.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var steps = Math.round((e.clientX - startX) / 6);
        index = (((startFrame - steps) % frames.length) + frames.length) % frames.length;
        image.src = frames[index];
      });
      ['pointerup', 'pointercancel'].forEach(function (name) {
        viewer.addEventListener(name, function () { dragging = false; });
      });
      return;
    }

    if (!image || reduceMotion) return;
    // A light spring towards the pointer, as useSpring did.
    var target = { x: 0, y: 0, s: 1 };
    var current = { x: 0, y: 0, s: 1 };
    var velocity = { x: 0, y: 0, s: 0 };
    var frame = null;
    function step() {
      var settled = true;
      ['x', 'y', 's'].forEach(function (k) {
        var force = (target[k] - current[k]) * 0.12;
        velocity[k] = (velocity[k] + force) * 0.72;
        current[k] += velocity[k];
        if (Math.abs(target[k] - current[k]) > 0.001 || Math.abs(velocity[k]) > 0.001) settled = false;
      });
      image.style.transform =
        'rotateX(' + current.y + 'deg) rotateY(' + current.x + 'deg) scale(' + current.s + ')';
      frame = settled ? null : requestAnimationFrame(step);
    }
    function kick() {
      if (!frame) frame = requestAnimationFrame(step);
    }
    viewer.addEventListener('pointermove', function (e) {
      var rect = viewer.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width - 0.5;
      var py = (e.clientY - rect.top) / rect.height - 0.5;
      target.x = px * 20;
      target.y = py * -20;
      target.s = 1.03;
      touched();
      kick();
    });
    ['pointerleave', 'pointerup', 'pointercancel'].forEach(function (name) {
      viewer.addEventListener(name, function () {
        target.x = 0;
        target.y = 0;
        target.s = 1;
        kick();
      });
    });
  }

  function initVideo(wrapper) {
    var video = wrapper.querySelector('video');
    var unmute = wrapper.querySelector('[data-unmute]');
    var mute = wrapper.querySelector('[data-mute]');
    if (!video) return;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    if (!reduceMotion) video.play().catch(function () {});
    if (unmute) {
      unmute.addEventListener('click', function () {
        video.muted = false;
        video.play().catch(function () {});
        unmute.hidden = true;
        if (mute) mute.hidden = false;
      });
    }
    if (mute) {
      mute.addEventListener('click', function () {
        video.muted = !video.muted;
      });
    }
  }

  /* ---------------------------------------------------------- cart page */

  function initCartPage(root) {
    root.querySelectorAll('[data-cart]').forEach(function (cart) {
      if (cart.dataset.ready) return;
      cart.dataset.ready = '1';
      var sectionId = cart.dataset.sectionId;

      on(cart, 'click', '[data-line-change]', function (event, link) {
        event.preventDefault();
        if (cart.getAttribute('aria-busy') === 'true') return;
        var lineEl = link.closest('[data-cart-line]');
        var quantity = Number(link.dataset.quantity);
        cart.setAttribute('aria-busy', 'true');
        if (quantity === 0 && lineEl && !reduceMotion) lineEl.classList.add('line-leaving');
        cartRequest(routes.cart_change_url + '.js', {
          line: Number(link.dataset.line),
          quantity: quantity,
          sections: [sectionId],
          sections_url: window.location.pathname,
        })
          .then(function (state) {
            var html = state.sections && state.sections[sectionId];
            var delay = quantity === 0 && !reduceMotion ? 200 : 0;
            setTimeout(function () {
              if (html) {
                var fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-cart]');
                if (fresh) {
                  // The entrance animation is for arriving on the page, not
                  // for every change of quantity.
                  fresh.querySelectorAll('.fade-up').forEach(function (el) {
                    el.classList.remove('fade-up');
                  });
                  cart.innerHTML = fresh.innerHTML;
                }
              }
              setCartCount(state.item_count);
              cart.removeAttribute('aria-busy');
              initReveals(cart);
            }, delay);
          })
          .catch(function (error) {
            if (lineEl) lineEl.classList.remove('line-leaving');
            cart.removeAttribute('aria-busy');
            showToast(error.message || t('update_error'), 'error');
          });
      });
    });
  }

  /* -------------------------------------------- collection "Load more" */

  on(document, 'click', '[data-load-more]', function (event, button) {
    event.preventDefault();
    var grid = document.querySelector('[data-product-grid]');
    var url = button.getAttribute('href');
    if (!grid || !url || button.getAttribute('aria-busy') === 'true') return;
    var idle = button.textContent;
    button.setAttribute('aria-busy', 'true');
    button.textContent = t('loading');
    fetch(url)
      .then(function (response) { return response.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var nextGrid = doc.querySelector('[data-product-grid]');
        var nextButton = doc.querySelector('[data-load-more]');
        var offset = grid.children.length;
        if (nextGrid) {
          // Copied first: appending moves each card out of nextGrid, which
          // would make a live list skip every other one.
          Array.prototype.slice.call(nextGrid.children).forEach(function (card, i) {
            card.style.setProperty('--reveal-delay', Math.min(i * 0.05, 0.4) + 's');
            grid.appendChild(card);
          });
        }
        initReveals(grid);
        if (nextButton) {
          button.setAttribute('href', nextButton.getAttribute('href'));
          button.textContent = nextButton.textContent;
          button.removeAttribute('aria-busy');
        } else {
          button.closest('[data-load-more-wrap]').remove();
        }
        var focusTarget = grid.children[offset] && grid.children[offset].querySelector('a');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      })
      .catch(function () {
        button.textContent = idle;
        button.removeAttribute('aria-busy');
        showToast(t('load_error'), 'error');
      });
  });

  /* ------------------------------------------------------------- header */

  on(document, 'click', '[data-menu-toggle]', function (event, button) {
    var panel = document.getElementById(button.getAttribute('aria-controls'));
    if (!panel) return;
    var open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.classList.toggle('is-open', open);
    panel.inert = !open;
  });

  /* ------------------------------------------------- M, the assistant */

  var MASCOT_KEY = 'meravo_mascot_minimized';

  function initAssistant(root) {
    root.querySelectorAll('[data-assistant]').forEach(function (assistant) {
      if (assistant.dataset.ready) return;
      assistant.dataset.ready = '1';

      var tips = JSON.parse(assistant.querySelector('[data-tips]').textContent || '[]');
      var expanded = assistant.querySelector('[data-assistant-expanded]');
      var launcher = assistant.querySelector('[data-assistant-launcher]');
      var face = assistant.querySelector('[data-assistant-face]');
      var bubble = assistant.querySelector('[data-assistant-bubble]');
      var bubbleText = assistant.querySelector('[data-assistant-tip]');
      var hand = assistant.querySelector('.assistant-hand');
      var tipIndex = 0;
      var bubbleTimer = null;
      var celebrateTimer = null;

      function readMinimized() {
        try {
          return localStorage.getItem(MASCOT_KEY) === '1';
        } catch (e) {
          return false;
        }
      }
      function setMinimized(value) {
        expanded.hidden = value;
        launcher.hidden = !value;
        try {
          localStorage.setItem(MASCOT_KEY, value ? '1' : '0');
        } catch (e) {
          // Private browsing: not worth failing over.
        }
      }
      expanded.hidden = readMinimized();
      launcher.hidden = !expanded.hidden;

      function openBubble() {
        if (!tips.length) return;
        tipIndex = (tipIndex + 1) % tips.length;
        bubbleText.textContent = tips[tipIndex];
        bubble.classList.add('is-open');
        clearTimeout(bubbleTimer);
        // A tap on a phone has no mouse-leave to close it.
        bubbleTimer = setTimeout(closeBubble, 3200);
      }
      function closeBubble() {
        bubble.classList.remove('is-open');
      }

      face.addEventListener('click', openBubble);
      face.addEventListener('mouseenter', openBubble);
      face.addEventListener('mouseleave', closeBubble);
      assistant.querySelector('[data-assistant-minimize]').addEventListener('click', function () {
        closeBubble();
        setMinimized(true);
      });
      launcher.addEventListener('click', function () {
        setMinimized(false);
      });

      if (!reduceMotion && hand) {
        setTimeout(function () { hand.classList.add('is-waving'); }, 700);
      }

      document.addEventListener('meravo:cart-added', function () {
        if (reduceMotion) return;
        face.classList.remove('is-celebrating');
        void face.offsetWidth;
        face.classList.add('is-celebrating');
        clearTimeout(celebrateTimer);
        celebrateTimer = setTimeout(function () {
          face.classList.remove('is-celebrating');
        }, 1500);
      });
    });
  }

  /* --------------------------------------------------------------- start */

  function init(root) {
    initReveals(root);
    initProduct(root);
    initCartPage(root);
    initAssistant(root);
  }

  init(document);

  // The theme editor swaps sections in and out without a page load.
  document.addEventListener('shopify:section:load', function (event) {
    init(event.target);
  });

  window.meravo = Object.assign(config, { showToast: showToast, formatMoney: formatMoney });
})();
