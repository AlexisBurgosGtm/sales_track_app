package expo.modules.networkbandwidth

import android.net.TrafficStats
import android.os.Process
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NetworkBandwidthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NetworkBandwidth")

    Function("getAppTrafficBytes") {
      val uid = Process.myUid()
      val rx = TrafficStats.getUidRxBytes(uid)
      val tx = TrafficStats.getUidTxBytes(uid)

      mapOf(
        "rxBytes" to normalizeTrafficBytes(rx),
        "txBytes" to normalizeTrafficBytes(tx),
      )
    }
  }

  private fun normalizeTrafficBytes(value: Long): Long {
    if (value == TrafficStats.UNSUPPORTED.toLong() || value < 0) {
      return 0L
    }

    return value
  }
}
