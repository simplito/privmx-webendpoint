import './style.css'
import {submitForm} from "./inbox.ts";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>PrivMX Endpoint Example</h1>
     <div  id="messages">
     </div>
    <form class="row" id="inbox-form">
      <input name="message" type="text" id="message-input" placeholder="Your message">
      <button id="counter" type="submit">Send Message</button>
    </form>
  </div>
`

const form = document.querySelector<HTMLFormElement>("#inbox-form")!
form.addEventListener('submit', function (this, e) {
    e.preventDefault()
    const data = new FormData(this)
    const message = data.get('message')?.toString()
    if(message){
        submitForm(message).then(() => {
            const notify = document.createElement('p')
            notify.innerText = "Entry sent"
            form.appendChild(notify);
            (document.querySelector("#message-input") as HTMLInputElement).value = ""
        })
    }
})
