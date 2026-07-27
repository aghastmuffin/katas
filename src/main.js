import './style.css';
import { displayLesson } from './lesson.js';
import { createGamifiedDashboard } from './gamification.js';

// Render dashboard on landing page
const dashboard = createGamifiedDashboard();
document.body.prepend(dashboard);

const beginBtn = document.querySelector('.btn');
if (beginBtn) {
  beginBtn.addEventListener('click', () => {
    displayLesson();
  });
}
