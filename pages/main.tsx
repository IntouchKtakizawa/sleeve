import React from 'react';
import {createRoot} from 'react-dom/client';
import Sleeve from '../app/sleeve';
import {initNative, isNative} from '../lib/native';
import '../app/globals.css';
initNative().finally(()=>createRoot(document.getElementById('root')!).render(<Sleeve/>));
if(!isNative && 'serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('/sleeve/sw.js').catch(()=>{});
