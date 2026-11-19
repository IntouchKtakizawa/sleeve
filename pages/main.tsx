import React from 'react';
import {createRoot} from 'react-dom/client';
import Sleeve from '../app/sleeve';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<Sleeve/>);
if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('/sleeve/sw.js').catch(()=>{});

