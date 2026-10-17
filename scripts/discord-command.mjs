export const workCommand={
  name:'submit-work',type:1,
  description:'Submit an image or music for host review and public display on induo.works.',
  options:[
    {name:'worker',type:3,required:true,description:'Your workshop ID, for example frondward',min_length:1,max_length:100},
    {name:'title',type:3,required:true,description:'Title of your work',min_length:1,max_length:100},
    {name:'description',type:3,required:true,description:'About the work; music uses this as its project or collection',min_length:1,max_length:1000},
    {name:'file',type:11,required:true,description:'Up to 8 MiB: PNG, JPEG, WebP, AVIF, GIF, MP3 or Opus OGG. No WAV.'},
  ],
};
