/**
 * @license
 * Copyright 2016-2020 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { flags } from '@oclif/command';
import { IArg } from '@oclif/parser/lib/args';
import Command from '../../command';
import * as cf from '../../utils/common-flags';
import { expandForAppName } from '../../utils/helpers';
import { getBalenaSdk, getVisuals, stripIndent } from '../../utils/lazy';
import { appToFleetOutputMsg, warnify } from '../../utils/messages';
import { tryAsInteger } from '../../utils/validation';
import { isV13 } from '../../utils/version';

import type { Application, Release } from 'balena-sdk';

interface ExtendedDevice extends DeviceWithDeviceType {
	dashboard_url?: string;
	application_name?: string;
	device_type?: string;
	commit?: string;
	last_seen?: string;
	memory_usage_mb: number | null;
	memory_total_mb: number | null;
	memory_usage_percent?: number;
	storage_usage_mb: number | null;
	storage_total_mb: number | null;
	storage_usage_percent?: number;
	cpu_temp_c: number | null;
	cpu_usage_percent: number | null;
	undervoltage_detected?: boolean;
}

interface FlagsDef {
	help: void;
	v13: boolean;
}

interface ArgsDef {
	uuid: string;
}

export default class DeviceCmd extends Command {
	public static description = stripIndent`
		Show info about a single device.

		Show information about a single device.
		`;
	public static examples = ['$ balena device 7cf02a6'];

	public static args: Array<IArg<any>> = [
		{
			name: 'uuid',
			description: 'the device uuid',
			parse: (dev) => tryAsInteger(dev),
			required: true,
		},
	];

	public static usage = 'device <uuid>';

	public static flags: flags.Input<FlagsDef> = {
		help: cf.help,
		v13: cf.v13,
	};

	public static authenticated = true;
	public static primary = true;

	public async run() {
		const { args: params, flags: options } = this.parse<FlagsDef, ArgsDef>(
			DeviceCmd,
		);
		const useAppWord = !options.v13 && !isV13();

		const balena = getBalenaSdk();

		const device = (await balena.models.device.get(params.uuid, {
			$select: [
				'device_name',
				'id',
				'overall_status',
				'is_online',
				'ip_address',
				'mac_address',
				'last_connectivity_event',
				'uuid',
				'supervisor_version',
				'is_web_accessible',
				'note',
				'os_version',
				'memory_usage',
				'memory_total',
				'public_address',
				'storage_block_device',
				'storage_usage',
				'storage_total',
				'cpu_usage',
				'cpu_temp',
				'cpu_id',
				'is_undervolted',
			],
			...expandForAppName,
		})) as ExtendedDevice;
		device.status = device.overall_status;

		device.dashboard_url = balena.models.device.getDashboardUrl(device.uuid);

		const belongsToApplication =
			device.belongs_to__application as Application[];
		device.application_name = belongsToApplication?.[0]
			? belongsToApplication[0].app_name
			: 'N/a';

		device.device_type = device.is_of__device_type[0].slug;

		const isRunningRelease = device.is_running__release as Release[];
		device.commit = isRunningRelease?.[0] ? isRunningRelease[0].commit : 'N/a';

		device.last_seen = device.last_connectivity_event ?? undefined;

		// Memory/Storage are really MiB
		// Consider changing headings to MiB once we can do lowercase

		device.memory_usage_mb = device.memory_usage;
		device.memory_total_mb = device.memory_total;

		device.storage_usage_mb = device.storage_usage;
		device.storage_total_mb = device.storage_total;

		device.cpu_temp_c = device.cpu_temp;
		device.cpu_usage_percent = device.cpu_usage;

		// Only show undervoltage status if true
		// API sends false even for devices which are not detecting this.
		if (device.is_undervolted) {
			device.undervoltage_detected = device.is_undervolted;
		}

		if (
			device.memory_usage != null &&
			device.memory_total != null &&
			device.memory_total !== 0
		) {
			device.memory_usage_percent = Math.round(
				(device.memory_usage / device.memory_total) * 100,
			);
		}

		if (
			device.storage_usage != null &&
			device.storage_total != null &&
			device.storage_total !== 0
		) {
			device.storage_usage_percent = Math.round(
				(device.storage_usage / device.storage_total) * 100,
			);
		}

		if (useAppWord && process.stderr.isTTY) {
			console.error(warnify(appToFleetOutputMsg));
		}

		console.log(
			getVisuals().table.vertical(device, [
				`$${device.device_name}$`,
				'id',
				'device_type',
				'status',
				'is_online',
				'ip_address',
				'public_address',
				'mac_address',
				useAppWord ? 'application_name' : 'application_name => FLEET',
				'last_seen',
				'uuid',
				'commit',
				'supervisor_version',
				'is_web_accessible',
				'note',
				'os_version',
				'dashboard_url',
				'cpu_usage_percent',
				'cpu_temp_c',
				'cpu_id',
				'memory_usage_mb',
				'memory_total_mb',
				'memory_usage_percent',
				'storage_block_device',
				'storage_usage_mb',
				'storage_total_mb',
				'storage_usage_percent',
				'undervoltage_detected',
			]),
		);
	}
}
