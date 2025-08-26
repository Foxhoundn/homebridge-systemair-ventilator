# Homebridge Systemair Ventilator Plugin

This is a Homebridge plugin for controlling a Systemair Ventilator through its web interface then into HomeKit. You must have a SAVEConnect WIFI module connected for this to work. You will need the IP address of the SAVEConnect device and include it in the plugin settings.

This plugin provides comprehensive control of your Systemair ventilator including:

- **Fan Speed Control**: Adjust ventilation speeds with multiple settings
- **Temperature Control**: Set target temperature and view current temperature
- **Humidity Monitoring**: Monitor current humidity levels
- **Thermostat Interface**: Control heating/cooling/auto modes through HomeKit's thermostat interface

# Installation:

If Homebridge is not already installed, use the following command to install it globally:

1. Install Homebridge:

   ```bash
   npm install -g homebridge

   ```

2. Install the Plugin

   ```bash
   npm install -g @lv426/homebridge-systemair-enhanced
   Run the following command to install the Homebridge Systemair Ventilator plugin:

   ```

3. Configure the Plugin
   Edit the Homebridge config.json file to include the plugin. Add the following under "accessories":

   ```yaml
   {
     "accessories": [
       {
         "accessory": "SystemairVentilatorEnhanced",
         "name": "Living Room Ventilator",
         "ip": "x.x.x.x"
       }
     ]
   }
   Replace add your Systemair IP with the actual IP address of your Systemair SAVEConnect device.

   ```

4. Restart Homebridge
   Restart Homebridge for the changes to take effect:
   ```bash
   sudo systemctl restart homebridge
   ```

# Features:

Control fan speeds with three settings: Low, Medium, and High.
Adjust the target temperature directly from HomeKit.
View current temperature and humidity readings.
Control heating/cooling/auto modes through the thermostat interface.
Automatically handles fan activation and speed synchronization.
Create scenes for Low, Normal, and High with the following mappings:

speed === 1 maps to 0% (Off)
speed === 2 maps to 16% (Low)
speed === 3 maps to 50% (Normal)
speed === 4 maps to 83% (High)

# Troubleshooting:

If the ventilator doesn't respond, check the following:

Ensure the IP address in the configuration is correct.
Verify that the SAVEConnect WIFI module is online.
Check Homebridge logs for error messages.

**Note**: The plugin creates multiple HomeKit accessories:

- **Fan**: Controls ventilation speed and on/off state
- **Thermostat**: Controls target temperature and heating/cooling modes
- **Humidity Sensor**: Displays current humidity levels
- **Refresh Switch**: Triggers refresh mode
- **Timer Display**: Shows remaining timer (displayed as battery level)

## Parameter IDs:

The plugin uses the following Systemair SAVEConnect parameter IDs:

- **1130**: Fan speed control (0=off, 2=low, 3=medium, 4=high)
- **1110**: Timer remaining time
- **1120**: Current temperature sensor reading
- **2000**: Target temperature setting
- **1125**: Current humidity sensor reading

**Important**: These parameter IDs are based on common Systemair configurations but may vary by device model. If temperature or humidity readings are not working correctly, you may need to modify the parameter IDs in the code to match your specific device's API configuration.
