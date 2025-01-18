<script setup>
import { ref, watch, onMounted } from 'vue';

const inputText = ref(`\\newcommand{\\f}[2]{#1f(#2)}
  \\f\\relax{x} = \\int_{-\\infty}^\\infty
    \\f\\hat\\xi\\,e^{2 \\pi i \\xi x}
    \\,d\\xi`);
const convertedText = ref('');
const tex2typ = window.tex2typ;
const isTypstInitialized = ref(false);
const renderedSvg = ref('');
const messages = ref([]);
const tooltipText = ref('Click to copy')

const initializeTypst = () => {
  return new Promise((resolve) => {
    const typstScript = document.getElementById('typst');
    typstScript.addEventListener('load', () => {
      $typst.setCompilerInitOptions({
        getModule: () =>
          'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm',
      });
      $typst.setRendererInitOptions({
        getModule: () =>
          'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm',
      });
      isTypstInitialized.value = true;
      resolve();
    });
  });
};

const convert = (text) => {
  try {
    const res = tex2typ.default(text)
    convertedText.value = res.expr;
    messages.value = res.msg;
  } catch (err) {
    console.error('Conversion error:', err);
    convertedText.value = `Error: ${err.message}`;
  }
};

const compile = (mainContent) => {
  if (!isTypstInitialized.value) {
    return;
  }
  $typst.svg({
    mainContent: `#show math.equation: set text(fill: white)
      #set text(26pt)
      #set page(width: auto, height: auto, margin: (x: 5pt, y: 5pt))
      $ ${mainContent} $`
  }).then(svg => {
    console.log(`rendered! SvgElement { len: ${svg.length} }`);
    renderedSvg.value = svg;
  });
};

const copyToClipboard = async () => {
  await navigator.clipboard.writeText(`$ ${convertedText.value} $`);
  tooltipText.value = 'Copied!'
  setTimeout(() => {
    tooltipText.value = 'Click to copy'
  }, 2000)
};

const messageTypeStyles = {
  info: 'border-info',
  warn: 'border-warning',
  error: 'border-error'
};

const messageTypeBadgeStyles = {
  info: 'text-info',
  warn: 'text-warning',
  error: 'text-error'
};

watch(isTypstInitialized, (newValue) => {
  if (newValue) {
    compile(convertedText.value)
  }
})

watch(inputText, (newValue) => {
  convert(newValue);
  compile(convertedText.value);
}, { immediate: true });

onMounted(async () => {
  const script = document.createElement('script')
  script.type = 'module'
  script.src = 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts/dist/esm/contrib/all-in-one-lite.bundle.js'
  script.id = 'typst'
  document.head.appendChild(script)
  await initializeTypst();
});
</script>

<template>

  <div class="pt-[20vh] mx-auto w-full space-y-4 max-w-4xl">
    <div class="absolute top-4 right-4">
      <a href="https://github.com/paran3xus/tex2typ">
        <img src="https://img.shields.io/badge/Repo-tex2typ-blue?logo=github">
      </a>
    </div>
    <div class="flex gap-4 w-full">
      <div class="flex-1">
        <textarea v-model="inputText" spellcheck="false" placeholder="Enter your LaTeX equation here..."
          class="h-64 p-4 font-mono textarea textarea-bordered w-full">
        </textarea>
      </div>

      <div class="flex-1">
        <div class="tooltip tooltip-bottom w-full" :data-tip="tooltipText" @click="copyToClipboard">
          <pre id="result-text"
            class="h-64 p-4 w-full font-mono bg-base-100 hover:bg-base-200 rounded-lg border border-base-300 transition whitespace-pre-wrap break-all">{{ convertedText }}</pre>
        </div>
      </div>
    </div>

    <div class="w-full block">
      <div class="flex items-center justify-center h-full">
        <div v-html="renderedSvg" class="flex items-center justify-center w-full h-full max-w-full max-h-full" />
      </div>
    </div>

    <div class="w-full max-w-3xl mx-auto">
      <div class="space-y-2">
        <div v-for="message in messages" :class="[
          'flex items-center p-3 rounded-md flex items-start gap-2 bg-base-100 border-l-4',
          messageTypeStyles[message.type]
        ]">
          <span :class="[
            'px-2 py-0.5 text-xs rounded-md font-medium justify-center bg-base-200',
            messageTypeBadgeStyles[message.type]
          ]">
            {{ message.type }}
          </span>

          <span class="text-sm ">
            {{ message.msg }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
