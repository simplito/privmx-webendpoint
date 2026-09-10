/** Everything your storage can see. Which is: nothing. */
import { useSyncExternalStore } from "react";
import * as store from "./store";

export function StoreInspector() {
    useSyncExternalStore(store.subscribe, store.bytesServed);
    const stored = store.list();

    return (
        <details className="inspector">
            <summary>
                What the storage sees - {stored.length} object(s),{" "}
                {store.totalBytes().toLocaleString()} B held
            </summary>
            <table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>replies to</th>
                        <th>note envelope</th>
                        <th>file</th>
                        <th>readable header</th>
                        <th>sealed tail</th>
                    </tr>
                </thead>
                <tbody>
                    {stored.map((d) => (
                        <tr key={d.id}>
                            <td>{d.id.slice(0, 8)}…</td>
                            <td>{d.parent ? d.parent.slice(0, 8) + "…" : "—"}</td>
                            <td>{d.note.length} B</td>
                            <td>{d.fileCipher ? `${d.fileCipher.length.toLocaleString()} B` : "—"}</td>
                            <td className="hex">{store.hex(d.note, 4)}</td>
                            <td className="hex">{store.hexTail(d.note, 12)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="muted">
                The header is meant to be readable - version, envelope type, and which Group this
                belongs to - because an envelope has to say which key opens it. Everything that
                matters is in the sealed payload: content, author, file name, all of it. This{" "}
                <code>Map</code> stands in for your S3 bucket, and that is all it ever sees.
            </p>
        </details>
    );
}
