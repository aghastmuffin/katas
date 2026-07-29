import './style.css';
import { displayLesson } from './lesson.js';
import { createGamifiedDashboard } from './gamification.js';
import { load } from 'js-yaml';

// Render dashboard on landing page
const dashboard = createGamifiedDashboard();
document.body.prepend(dashboard);

// Determine the endpoint (local default or custom query parameter '?endpoint=...')
const urlParams = new URLSearchParams(window.location.search);
const customEndpoint = urlParams.get('endpoint');
const defaultEndpoint = window.location.pathname.endsWith('/')
  ? window.location.pathname + 'lessons/'
  : window.location.pathname + '/lessons/';
const endpoint = customEndpoint ? (customEndpoint.endsWith('/') ? customEndpoint : customEndpoint + '/') : defaultEndpoint;

async function init() {
  const beginBtn = document.querySelector('.btn');
  let lessonSelect = document.querySelector('#lesson-select');

  // Build the UI if it doesn't exist yet
  if (beginBtn && !lessonSelect) {
    const container = document.createElement('div');
    container.className = 'lesson-selector';
    container.style.margin = '2rem 0';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '1rem';

    const label = document.createElement('label');
    label.htmlFor = 'lesson-select';
    label.style.fontSize = '1.1rem';
    label.style.color = '#bebda7';
    label.textContent = 'Choose a Lesson Set:';

    lessonSelect = document.createElement('select');
    lessonSelect.id = 'lesson-select';
    lessonSelect.className = 'lang-select';
    lessonSelect.style.padding = '0.5rem 1rem';
    lessonSelect.style.fontSize = '1rem';
    lessonSelect.style.maxWidth = 'none';
    lessonSelect.style.borderRadius = '5px';

    beginBtn.parentNode.insertBefore(container, beginBtn);
    container.appendChild(label);
    container.appendChild(lessonSelect);
    container.appendChild(beginBtn);
  }

  // Fallback defaults
  let lessonsMap = {
    'two-pointers': 'Understanding Two Pointers',
    'arrays-hashing': 'Arrays & Hashing',
    'sliding-window': 'Sliding Window',
    'stack': 'Stack',
  };
  let lessonOrder = ['arrays-hashing', 'two-pointers', 'sliding-window', 'stack'];

  try {
    // Dynamically fetch index.yaml from the endpoint
    const response = await fetch(`${endpoint}index.yaml`);
    
    // Catch standard HTTP errors (like 404 Not Found)
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const indexYamlText = await response.text();
    const indexData = load(indexYamlText);

    if (indexData) {
      if (indexData.lessons) {
        lessonsMap = indexData.lessons;
      }
      if (indexData['lesson-order']) {
        const orderVal = indexData['lesson-order'];
        if (typeof orderVal === 'string') {
          const lines = orderVal.split('\n');
          const parsedOrder = [];
          for (const line of lines) {
            const match = line.match(/^\s*\d+\s*:\s*(\S+)/);
            if (match) {
              parsedOrder.push(match[1]);
            }
          }
          if (parsedOrder.length > 0) {
            lessonOrder = parsedOrder;
          }
        } else if (Array.isArray(orderVal)) {
          lessonOrder = orderVal.map(String);
        } else if (typeof orderVal === 'object' && orderVal !== null) {
          lessonOrder = Object.values(orderVal).map(String);
        }
      }
    }
  } catch (err) {
    // A TypeError on fetch usually means a Network or CORS error. 
    // If we are fetching a custom endpoint, it is highly likely a CORS block.
    if (err.name === 'TypeError' && customEndpoint) {
        const corsErrorMessage = "there was a cors error, we can't access that content, please request it at github.com/aghastmuffin/katas-lessons, the official lesson repo or try a site without CORS enforced. internalerror: KT-fe2";
        
        // 1. Make it visible via an alert
        alert(corsErrorMessage);
        
        // 2. Make it visible on the actual page UI so they don't miss it
        if (beginBtn) {
            const errorDisplay = document.createElement('p');
            errorDisplay.style.color = '#ff6b6b'; 
            errorDisplay.style.fontWeight = 'bold';
            errorDisplay.style.marginTop = '1rem';
            errorDisplay.textContent = corsErrorMessage;
            beginBtn.parentNode.insertBefore(errorDisplay, beginBtn.nextSibling);
        }

        // 3. Throw the error to halt further execution gracefully
        throw new Error(corsErrorMessage);
    }
    
    console.warn("Could not fetch or parse index.yaml, using static fallback", err);
  }

  // Populate the select dropdown dynamically
  if (lessonSelect) {
    lessonSelect.replaceChildren();
    for (const id of lessonOrder) {
      const label = lessonsMap[id] || id;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${label} (NeetCode 150)`;
      lessonSelect.appendChild(opt);
    }
  }

  if (beginBtn) {
    beginBtn.addEventListener('click', () => {
      // Assuming source-id might be utilized somewhere else, we capture it
      const lessonHost = document.getElementById("source-id")?.value;
      const selectedLesson = lessonSelect ? lessonSelect.value : 'two-pointers';
      
      // Pass the selected lesson and endpoint off to your lesson.js logic
      displayLesson(selectedLesson, endpoint);
    });
  }
}

// Kick off the process
init();