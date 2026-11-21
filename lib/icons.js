// Original, locally rendered line artwork. No icon font, emoji or remote assets.
export const ICON_PATHS={
  pin:'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  map:'m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  stairsUp:'M3 20h6v-5h5v-5h6M6 9V3m-3 3 3-3 3 3',
  stairsDown:'M3 20h6v-5h5v-5h6M6 3v6m-3-3 3 3 3-3',
  lock:'M6 11h12a1 1 0 0 1 1 1v8H5v-8a1 1 0 0 1 1-1Zm2 0V7a4 4 0 0 1 8 0v4m-4 4v2',
  unlock:'M6 11h12a1 1 0 0 1 1 1v8H5v-8a1 1 0 0 1 1-1Zm2 0V7a4 4 0 0 1 7.5-2m-3.5 10v2',
  mail:'M3 5h18v14H3V5Zm0 1 9 7 9-7M3 19l6-7m12 7-6-7',
  download:'M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6',
  upload:'M12 15V3m-4 4 4-4 4 4M4 15v6h16v-6',
  trash:'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14m-8 4v6m4-6v6',
  paw:'M8 14c1.2-2.2 2-3 4-3s2.8.8 4 3c.7 1.3 2 2.2 2 3.6 0 2-1.6 2.8-3.4 2.1l-2.6-.8-2.6.8C7.6 20.4 6 19.6 6 17.6c0-1.4 1.3-2.3 2-3.6ZM7 7.5c0 1.4-.7 2.5-1.6 2.5S3.5 8.9 3.5 7.5 4.2 5 5.1 5 7 6.1 7 7.5Zm4-2c0 1.4-.7 2.5-1.5 2.5S8 6.9 8 5.5 8.7 3 9.5 3 11 4.1 11 5.5Zm5 0c0 1.4-.7 2.5-1.5 2.5S13 6.9 13 5.5 13.7 3 14.5 3 16 4.1 16 5.5Zm4.5 2c0 1.4-.7 2.5-1.6 2.5S17 8.9 17 7.5 17.7 5 18.6 5s1.9 1.1 1.9 2.5Z',
  cat:'m5 10-1-7 6 4h4l6-4-1 7a8 8 0 1 1-14 0Zm3 3h.1m7.8 0h.1m-6 3 2 1 2-1m-2 1v2M2 14l4 1m-4 3 4-1m16-3-4 1m4 3-4-1',
  heart:'M12 21 3.8 13C-2 7.2 6 0 12 6c6-6 14 1.2 8.2 7L12 21Z',
  hand:'M8 13V4a1.5 1.5 0 0 1 3 0v7-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v7c0 4-2 7-6 7h-2c-2 0-3-1-4-3l-4-5c-1.5-2 1-3.5 2.5-2L8 13Z',
  bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4M12 2v2',
  footsteps:'M8 3C5 3 4 7 5 9s4 2 5 0 1-6-2-6Zm-2 9h4v4H6v-4Zm10-4c-3 0-4 4-3 6s4 2 5 0 1-6-2-6Zm-2 9h4v4h-4v-4Z',
  yarn:'M19 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-13-3 11 7M5 12l8 6m-5-13 10 7M12 4c-3 4-4 9-3 13m7-12c-3 4-4 9-3 13m6-6c5 0-2 8 2 8h1',
  moon:'M20 14A8 8 0 0 1 10 3 9 9 0 1 0 20 14Z',
  close:'m6 6 12 12M18 6 6 18',
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',
  up:'M12 20V4m-6 6 6-6 6 6',down:'M12 4v16m-6-6 6 6 6-6',
  right:'M4 12h16m-6-6 6 6-6 6',
  reset:'M4 10a8 8 0 1 1 0 5m0-12v7h7',
  fullscreen:'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5',
  check:'m5 12 4 4L19 6',info:'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  spark:'m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z'
};
export function iconMarkup(name){
  const path=ICON_PATHS[name];if(!path)throw new Error(`Unknown icon: ${name}`);
  return `<svg class="uiIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" data-art="${name}"><path d="${path}"/></svg>`;
}
export function iconElement(name,doc=document){
  const path=ICON_PATHS[name];if(!path)throw new Error(`Unknown icon: ${name}`);
  const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg'),p=doc.createElementNS(ns,'path');
  for(const [k,v] of Object.entries({class:'uiIcon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.65','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false','data-art':name}))svg.setAttribute(k,v);
  p.setAttribute('d',path);svg.append(p);return svg;
}
export function iconLabel(element,name,text){
  // Use text nodes for all runtime content; organization names never enter SVG/HTML.
  const key=`${name}|${text}`;if(element.dataset.iconLabel===key&&element.textContent===text&&element.firstElementChild?.dataset.art===name)return;
  element.dataset.iconLabel=key;element.replaceChildren(iconElement(name,element.ownerDocument),element.ownerDocument.createTextNode(text));
}
