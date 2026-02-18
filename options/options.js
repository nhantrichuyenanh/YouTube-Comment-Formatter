const DEFAULT_SETTINGS = {
  enableHotkeys: true,
  showButtons: true,
  autoPreview: false
};

let enableHotkeysCheckbox;
let showButtonsCheckbox;
let autoPreviewCheckbox;

document.addEventListener('DOMContentLoaded', initializeOptions);

function initializeOptions() {
  enableHotkeysCheckbox = document.getElementById('enable-hotkeys');
  showButtonsCheckbox = document.getElementById('show-buttons');
  autoPreviewCheckbox = document.getElementById('auto-preview');

  loadSettings();

  enableHotkeysCheckbox.addEventListener('change', handleSettingChange);
  showButtonsCheckbox.addEventListener('change', handleSettingChange);
  autoPreviewCheckbox.addEventListener('change', handleSettingChange);
}

function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, function(result) {
    enableHotkeysCheckbox.checked = result.enableHotkeys;
    showButtonsCheckbox.checked = result.showButtons;
    autoPreviewCheckbox.checked = result.autoPreview;
  });
}

function handleSettingChange() {
  const currentSettings = {
    enableHotkeys: enableHotkeysCheckbox.checked,
    showButtons: showButtonsCheckbox.checked,
    autoPreview: autoPreviewCheckbox.checked
  };

  chrome.storage.sync.set(currentSettings, function() { notifyContentScripts(currentSettings); });
}

function notifyContentScripts(settings) {
  // query all YouTube tabs and send updated settings
  chrome.tabs.query({ url: "https://www.youtube.com/*" }, function(tabs) {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'updateSettings',
        settings: settings
      }, function(response) {
        if (chrome.runtime.lastError) {
        }
      });
    });
  });
}