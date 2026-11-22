// Canvas labels use the same plain system sans-serif family as the readable UI.
export const LABEL_FONT='Arial, Helvetica, sans-serif';
export function wrapLines(context,text,maxWidth){
  const lines=[];let line='';
  for(const word of String(text).trim().split(/\s+/).filter(Boolean)){
    if(context.measureText(line?`${line} ${word}`:word).width<=maxWidth){line+=(line?' ':'')+word;continue;}
    if(line){lines.push(line);line='';}
    for(const char of word){if(line&&context.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}
  }
  if(line)lines.push(line);return lines;
}
export function fitLabel(context,text,{width,height,maxSize,minSize=24,weight=700,lineHeight=1.22}){
  for(let size=maxSize;size>=minSize;size-=2){
    context.font=`${weight} ${size}px ${LABEL_FONT}`;const lines=wrapLines(context,text,width);
    if(lines.length*size*lineHeight<=height||size<=minSize+1)return {lines,size,leading:size*lineHeight};
  }
}
export function drawLabel(context,text,{x,y,width,height,maxSize,minSize=24,weight=700,align='left',color='#171717'}){
  const layout=fitLabel(context,text,{width,height,maxSize,minSize,weight});context.fillStyle=color;context.textAlign=align;context.textBaseline='top';
  layout.lines.forEach((line,i)=>context.fillText(line,x,y+i*layout.leading));return layout;
}
