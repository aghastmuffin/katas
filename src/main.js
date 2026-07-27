import './style.css';
import { displayLesson } from './lesson.js';

const beginBtn = document.querySelector('.btn');
if (beginBtn) {
  beginBtn.addEventListener('click', () => {
    displayLesson();
  });
}
