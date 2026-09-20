package com.poquito.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Permite que la interfaz avise a los widgets cuando cambian las tareas. */
@CapacitorPlugin(name = "PoquitoWidget")
public class PoquitoWidgetPlugin extends Plugin {
    @PluginMethod
    public void refresh(PluginCall call) {
        WidgetRenderer.refreshAll(getContext());
        call.resolve();
    }
}
