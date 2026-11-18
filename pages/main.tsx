import React from 'react';
import {createRoot} from 'react-dom/client';
import Sleeve from '../app/sleeve';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<Sleeve accountBase="https://sleeve.hahekenna.chatgpt.site"/>);
