import { DatabuddyConfig } from "./types";
import { version } from '../../package.json'

export function isScriptInjected() {
  return !!document.querySelector('script[data-databuddy-injected]');
}

export function createScript(props: DatabuddyConfig) {
  const script = document.createElement('script');

  script.src = props.scriptUrl || 'https://cdn.databuddy.cc/databuddy.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-databuddy-injected', 'true');
  script.setAttribute('data-sdk-version', props.sdkVersion || version);

  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined && key !== 'sdkVersion') {
      const dataKey = `data-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;

      script.setAttribute(dataKey, String(value));
    }
  }

  return script;
}
