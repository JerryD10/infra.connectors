const child_process = require('child_process');
const fs = require('fs-extra');
const os = require('os');
const si = require('systeminformation');
const checkDiskSpace = require('check-disk-space');
const request = require('request');
const path = require('path');


class LocalConnector {

    constructor() 
    {
        this.cwd = '.';
    }

    setCWD(cwd){
        this.cwd = cwd;
    }

    getCWD(){
        return this.cwd;
    }

    async getContainerIp() {
        return 'localhost';
    }

    async getName() {
        return 'localhost';
    }

    async ready() {
        // If using local connector, localhost is always ready
        return true;
    }

    async getState(VMName) {
        return "running";
    }

    async setup(context, setup) {
        return new Promise(((resolve, reject) => {
            if (setup && setup.cmd) {
                console.log(`\tSetup: ${setup.cmd}`);
                let child = child_process.spawn(`${setup.cmd}`, {
                    shell: true,
                });

                child.stderr.on('data', (error) => {
                    console.error(error);
                    reject({ error });
                });

                child.stdout.on('data', (data) => {
                    console.log('\n\n\n\n\n', data);
                    if (setup.wait_for) {
                        if (data.indexOf(setup.wait_for) !== -1) {
                            console.log(`\tResolved wait_for condition: Stdout matches "${setup.wait_for}"`);
                            resolve({ child });
                        }
                    }
                });
            }
        }));
    }

    async tearDown(obj) {
        if (obj && obj.child) {
            // 'SIGINT'
            console.log('\tTearing down');
            obj.child.stdout.removeAllListeners('data');
            obj.child.stdin.write('\x03');
            obj.child.kill();
        }
    }

    async exec(cmd) {
        return new Promise(((resolve, reject) => {
            child_process.exec(`${cmd}` + '\n echo "\n$?"', {cwd: this.cwd}, (error, stdout, stderr) => {
                let stdoutLines = stdout.trim().split('\n');
                let exitCode = Number(stdoutLines.slice(-1)[0].replace(/s+/, ''));
                if(stdoutLines.slice(-2, -1) == '') stdoutLines.splice( -2 , 1 );
                stdout = stdoutLines.slice(0,-1).join('\n');
                resolve({
                    stdout, stderr, exitCode
                })
            });
        }));
    }

    // Execute and return pid
    async spawn(cmd, options) {
        return new Promise((resolve, reject) => {
            options = options || {};
            options.shell = true;
            options.cwd = this.cwd;
            let child = child_process.spawn(cmd, options);

            child.stderr.on('data', (error) => {
                console.error(error);
                reject({ error });
            });

            // child.stdout.on('data', (data) => {
            //     console.log(data);
            // });
            resolve({pid: child.pid });
        });
    }

    async resolveHost(host) {
        return false;
    }

    async isReachable(address, context) {

        //prepend http for domains
        if (!/^[a-z]+:\/\//.test(address)) 
        {
            address = "http://" + address;
        }

        return new Promise(((resolve, reject) => {
            request(address, { timeout: 1000 }, (error, response, body) => {
                if (!error && response.statusCode === 200) {
                    resolve(true);
                } else if (error && error.code) {
                    resolve(false);
                } else {
                    resolve(false);
                }
            });
        }));        
    }

    async pathExists(destPath, context) {
        return fs.pathExists(this.resolvePath(destPath));
    }

    async contains(context, file, string, expect) {
        if (await this.pathExists(file)) {
            return expect === (await fs.readFile(this.resolvePath(file))).includes(string);
        }
        throw Error('file doesn\'t exist');
    }

    checkVirt() {
        let status = null;
        if (os.platform() === 'win32') {
            let output = child_process.execSync('systeminfo');
            if (output && output.toString().indexOf('Virtualization Enabled In Firmware: Yes') !== -1) {
                status = true;
            } else {
                status = false;
            }
        } else if (os.platform() === 'darwin') {
            let output = child_process.execSync('sysctl -a | grep machdep.cpu.features');
            if (output && output.toString().indexOf('VMX') !== -1) {
                status = true;
            } else {
                status = false;
            }
        } else if (os.platform() === 'linux') {
            let output = null;
            try {
                output = child_process.execSync("cat /proc/cpuinfo | grep -E -c 'svm|vmx'");
            } catch (err) { 
                output = err.stdout.toString();
            }
            
            if (output != 0) {
                status = true;
            } else {
                status = false;
            }
        }
        return status;
    }

    async getCPUCores(_context) {
        return (await si.cpu()).cores;
    }

    async getMemory(_context) {
        return Math.floor((await si.mem()).total / 1024000000);
    }

    async getDiskSpace(_context, diskLocation) {
        return Math.floor((await checkDiskSpace(diskLocation)).free / 1024000000);
    }

    resolvePath(destPath) {
        if (!destPath) return destPath;
        if (destPath.slice(0, 2) !== '~/') return path.resolve(destPath);
        return path.resolve(path.join(os.homedir(), destPath.slice(2)));
    }
}

// Export factory class
module.exports = LocalConnector;
