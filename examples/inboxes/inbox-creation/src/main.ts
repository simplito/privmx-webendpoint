import './style.css'
import {submitForm} from "./inbox.ts";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>PrivMX Endpoint Example</h1>
     <div  id="messages">
     </div>
    <form class="row" id="inbox-form">
      <input name="inbox_name" type="text" id="inbox_name-input" placeholder="Your Inbox Name">
      <button id="counter" type="submit">Send Message</button>
    </form>
  </div>
`

const form = document.querySelector<HTMLFormElement>("#inbox-form")!
form.addEventListener('submit', function (this, e) {
    e.preventDefault()
    const data = new FormData(this)
    const inboxName = data.get('inbox_name')?.toString()
    if(inboxName){
        submitForm(inboxName).then(() => {
            const notify = document.createElement('p')
            notify.innerText = "Inbox created"
            form.appendChild(notify);
            (document.querySelector("#message-input") as HTMLInputElement).value = ""
        })
    }
})
