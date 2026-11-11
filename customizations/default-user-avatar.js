// Apply the neutral avatar once to the newly installed local UI's own profile.
(() => {
  if (window.__openclawDefaultAvatarSetup) return;
  window.__openclawDefaultAvatarSetup = true;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) return;
  let attempts=0, busy=false;
  const timer=setInterval(async()=>{
    if (busy) return;
    const pane=[...document.querySelectorAll('openclaw-chat-pane')].find(p=>p.state?.connected&&p.state?.client);
    const user=pane?.context?.gateway?.snapshot?.selfUser;
    if(!pane||!user?.id)return;
    if(++attempts>5){clearInterval(timer);return;}
    const key='openclaw.bundle.default-avatar.v1:'+user.id;
    if(localStorage.getItem(key)){clearInterval(timer);return;}
    busy=true;
    try {
      const response=await fetch('/assets/local-default-user.png');
      if(!response.ok)throw Error('Avatar unavailable');
      const bytes=new Uint8Array(await response.arrayBuffer());
      const avatarBase64=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
      const result=await pane.state.client.request('users.setAvatar',{profileId:user.id,mime:'image/png',avatarBase64});
      if(result.profile){
        const avatarUrl='/api/users/'+encodeURIComponent(user.id)+'/avatar?v='+encodeURIComponent(result.avatarRevision);
        pane.context.gateway.updateSelfUser?.({avatarUrl});
        localStorage.setItem(key,'1');clearInterval(timer);
      }
    }catch{ /* The profile page can also apply the bundled PNG manually. */ }
    finally{busy=false;}
  },1000);
})();
