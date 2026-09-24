import './ui/styles/base.css';
import { mount } from './ui/app.js';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) mount(app);
