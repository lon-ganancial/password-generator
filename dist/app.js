    (() => {
      'use strict';

      const $ = id => document.getElementById(id);
      const COPY_PATH = 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z';
      const CHECK_PATH = 'M9 16.17 4.83 12 3.41 13.41 9 19l12-12-1.41-1.41z';
      const ERROR_PATH = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';
      const randomBuffer = new Uint32Array(1);
      let wasm;
      let activePassword = '';
      let copyTimer;
      let toastTimer;

      function strength(password) {
        const avoidSimilar = $('ambiguous').checked;
        const groups = [
          ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', $('upper').checked],
          ['abcdefghijklmnopqrstuvwxyz', $('lower').checked],
          ['0123456789', Number($('numbers').value) > 0],
          ['!@#$%^&*()-_=+[]{};:,.?/', Number($('symbols').value) > 0]
        ];
        const bits = groups.reduce((sum, [chars, enabled]) => {
          if (!enabled) return sum;
          if (avoidSimilar) chars = [...chars].filter(char => !'0O1lI'.includes(char)).join('');
          return sum + [...password].filter(char => chars.includes(char)).length * Math.log2(chars.length);
        }, 0);
        if (bits < 40) return [1, 'Weak password'];
        if (bits < 60) return [2, 'Fair password'];
        if (bits < 85) return [3, 'Strong password'];
        return [4, 'Very strong password'];
      }

      // Display and interactions
      function syncSlider(slider) {
        const min = Number(slider.min);
        const max = Number(slider.max);
        $(slider.id + 'Value').textContent = slider.value;
        slider.style.setProperty('--progress', `${100 * (Number(slider.value) - min) / Math.max(1, max - min)}%`);
      }

      function togglePanel(button, panel) {
        const open = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(open));
        panel.setAttribute('aria-hidden', String(!open));
        panel.inert = !open;
        panel.classList.toggle('is-open', open);
      }

      function copyState(copied) {
        $('copyIcon').setAttribute('d', copied ? CHECK_PATH : COPY_PATH);
        $('copy').classList.toggle('copied', copied);
        $('copy').setAttribute('aria-label', copied ? 'Password copied' : 'Copy password');
        $('copy').title = copied ? 'Copied' : 'Copy password';
      }

      function fitPassword() {
        if (!activePassword) return;
        const output = $('password');
        const text = output.querySelector('.password-text');
        let size = 27;
        output.style.fontSize = `${size}px`;
        while (size > 12 && text.getBoundingClientRect().height > output.clientHeight - 3) {
          output.style.fontSize = `${--size}px`;
        }
      }

      function hideToast() {
        clearTimeout(toastTimer);
        $('toast').classList.remove('show');
      }

      function showToast(message, isError = false) {
        hideToast();
        $('toastText').textContent = message;
        $('toast').classList.toggle('error-toast', isError);
        $('toastIcon').setAttribute('d', isError ? ERROR_PATH : CHECK_PATH);
        $('toast').classList.add('show');
        toastTimer = setTimeout(hideToast, 2300);
      }

      function generate() {
        $('error').textContent = '';
        $('error').classList.remove('active');
        clearTimeout(copyTimer);
        hideToast();
        copyState(false);

        try {
          if (!wasm) throw new Error('Password generator is unavailable. Reload the page.');
          const result = wasm.generate(Number($('length').value), Number($('upper').checked), Number($('lower').checked), Number($('numbers').value), Number($('symbols').value), Number($('ambiguous').checked));
          if (result === 1) throw new Error('Choose at least one character type.');
          if (result === 2) throw new Error('Increase a limit or enable letters to fill the password.');
          if (result !== 0) throw new Error('Invalid password settings.');
          activePassword = new TextDecoder().decode(new Uint8Array(wasm.memory.buffer, wasm.password_ptr(), Number($('length').value)));
          $('password').classList.remove('placeholder');
          $('password').querySelector('.password-text').textContent = activePassword;
          fitPassword();
          $('copy').disabled = false;
          const [level, label] = strength(activePassword);
          $('strength').dataset.level = String(level);
          $('strengthText').textContent = label;
          $('strength').setAttribute('aria-label', `Estimated strength: ${label}`);
          $('announcement').textContent = 'New password generated';
        } catch (error) {
          activePassword = '';
          $('password').querySelector('.password-text').textContent = 'Adjust your settings to continue';
          $('password').style.fontSize = '';
          $('password').classList.add('placeholder');
          $('copy').disabled = true;
          $('strength').dataset.level = '0';
          $('strengthText').textContent = 'Password unavailable';
          $('error').textContent = error instanceof Error ? error.message : 'Unable to generate a password.';
          $('error').classList.add('active');
          $('announcement').textContent = $('error').textContent;
        }
      }

      async function copyPassword() {
        if (!activePassword) return;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(activePassword);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = activePassword;
            textarea.style.cssText = 'position:fixed;left:-99999px;opacity:0';
            document.body.append(textarea);
            textarea.select();
            const copied = document.execCommand('copy');
            textarea.remove();
            if (!copied) throw new Error('Copy failed');
          }
          copyState(true);
          showToast('Password copied');
          clearTimeout(copyTimer);
          copyTimer = setTimeout(() => copyState(false), 1800);
        } catch {
          showToast('Could not copy password', true);
          $('announcement').textContent = 'Unable to copy automatically. Select the password to copy it.';
        }
      }

      // Events
      $('customizeToggle').addEventListener('click', () => togglePanel($('customizeToggle'), $('customizePanel')));
      $('moreToggle').addEventListener('click', () => togglePanel($('moreToggle'), $('morePanel')));
      $('generate').addEventListener('click', generate);
      $('copy').addEventListener('click', copyPassword);

      $('length').addEventListener('input', () => {
        const length = $('length').value;
        syncSlider($('length'));
        for (const name of ['numbers', 'symbols']) {
          const slider = $(name);
          slider.max = length;
          if (Number(slider.value) > Number(length)) slider.value = length;
          syncSlider(slider);
        }
        generate();
      });
      for (const name of ['numbers', 'symbols']) {
        $(name).addEventListener('input', () => {
          syncSlider($(name));
          generate();
        });
      }
      for (const name of ['upper', 'lower', 'ambiguous']) {
        $(name).addEventListener('change', generate);
      }
      window.addEventListener('resize', fitPassword);

      for (const name of ['length', 'numbers', 'symbols']) syncSlider($(name));
      $('generate').disabled = true;
      $('copy').disabled = true;
      (async () => {
        try {
          if (!globalThis.crypto?.getRandomValues) throw new Error('Secure randomness is unavailable.');
          const response = await fetch('password_generator.wasm');
          if (!response.ok) throw new Error('Unable to load the password generator.');
          const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {
            env: { random_u32: () => { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; } }
          });
          wasm = instance.exports;
          $('generate').disabled = false;
          generate();
        } catch (error) {
          $('error').textContent = error instanceof Error ? error.message : 'Unable to load the password generator.';
          $('error').classList.add('active');
          $('password').classList.add('placeholder');
          $('password').querySelector('.password-text').textContent = 'Password generator unavailable';
          $('strength').dataset.level = '0';
          $('strengthText').textContent = 'Password unavailable';
        }
      })();
    })();
