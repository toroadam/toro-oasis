import { mobileLayout } from './mobile-layout.js';
import './site-header.css';
import { arrowUpRight } from './ui-icons.js';
const links=[];
export function siteHeader(current){
 queueMicrotask(()=>{
  mobileLayout(current);
  const menu=document.querySelector('#mobile-navigation'),toggle=document.querySelector('#menu-toggle');
  toggle.onclick=()=>{menu.showModal();toggle.setAttribute('aria-expanded','true');};
  const close=()=>{toggle.setAttribute('aria-expanded','false');menu.close();};
  menu.addEventListener('cancel',()=>toggle.setAttribute('aria-expanded','false'));
  menu.querySelector('button').onclick=close;menu.addEventListener('close',()=>toggle.setAttribute('aria-expanded','false'));
  menu.addEventListener('click',e=>{if(e.target===menu)close();});
  menu.querySelector('#mobile-menu-sources').onclick=()=>{close();document.querySelector('#nav-science').click();};
  menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
 });
 const items=links.map(([id,href,label],i)=>`<a data-experience="${id}" href="${href}"${id===current?' aria-current="page" class="nav-active"':''}><span class="nav-number">0${i+1}</span>${label}<span class="nav-arrow" aria-hidden="true">↗</span></a>`).join('');
 return `<header class="site-header global-header"><a class="wordmark" data-experience="planet" href="${import.meta.env.BASE_URL}" aria-label="Toro Oasis home"><img src="${import.meta.env.BASE_URL}brand/toro-logo.svg" alt="Toro" width="42" height="28"><span class="wordmark-name">Oasis</span></a><nav class="desktop-navigation" aria-label="Main navigation">${items}</nav><div class="header-actions"><button id="nav-science" class="header-sources">Sources ${arrowUpRight}</button><button id="menu-toggle" aria-haspopup="dialog" aria-controls="mobile-navigation" aria-expanded="false">Explore <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h14M3 13h14"/></svg></button></div></header><dialog id="mobile-navigation" aria-label="Explore Toro Oasis"><div class="mobile-menu-heading"><span>TORO OASIS · LIVE NETWORK</span><button aria-label="Close navigation">✕</button></div><nav aria-label="All experiences">${items}</nav><div class="mobile-menu-footer"><button id="mobile-menu-sources" aria-haspopup="dialog">Sources ${arrowUpRight}</button></div></dialog>`;
}
