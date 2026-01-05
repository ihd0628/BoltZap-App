import 'react-native-get-random-values';

import Clipboard from '@react-native-clipboard/clipboard';
import { Builder, Config, type Node } from 'ldk-node-rn';
import { type Address, NetAddress } from 'ldk-node-rn/src/classes/Bindings';
import React, { useState } from 'react';
import { Alert, StatusBar } from 'react-native';
import RNFS from 'react-native-fs';

import * as S from './App.style';

// Node instance needs to be kept outside render cycle or in a ref.
// Keeping it simple here as a module variable for this Hello World.
let runningNode: Node | null = null;

const App = (): React.JSX.Element => {
  const [nodeId, setNodeId] = useState<string>('초기화 안됨 (Not initialized)');
  const [status, setStatus] = useState<string>('중지됨 (Stopped)');
  const [logs, setLogs] = useState<string[]>([]);
  const [invoice, setInvoice] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  // On-chain Wallet State
  const [onChainAddress, setOnChainAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('0');

  const addLog = (msg: string) => {
    console.log(msg);
    setLogs((prev) => [msg, ...prev]);
  };

  const initNode = async () => {
    try {
      if (runningNode) {
        addLog('⚠️ 이미 노드가 실행 중입니다.');
        return;
      }

      addLog('🚀 LDK 노드 초기화 중...');

      // 1. 데이터 디렉토리 생성
      const path = `${RNFS.DocumentDirectoryPath}/ldk_node_data`;
      await RNFS.mkdir(path);
      const logPath = `${RNFS.DocumentDirectoryPath}/ldk_node_logs`;
      await RNFS.mkdir(logPath);
      addLog(`📁 데이터 경로: ${path}`);

      // 2. 노드 빌드 (테스트넷)
      // v0.3.x 이상에서는 Config 객체를 먼저 생성해야 합니다.
      const config = new Config();
      const listeningAddr = new NetAddress(
        '127.0.0.1',
        Math.floor(Math.random() * (60000 - 10000 + 1) + 10000),
      );
      await config.create(path, logPath, 'testnet', [listeningAddr]);

      // Esplora를 사용하여 블록체인 데이터 동기화
      const builder = new Builder();
      await builder.fromConfig(config);

      // builder.setNetwork/StoragePath는 Config에서 이미 설정됨
      await builder.setEsploraServer('https://mempool.space/testnet/api');
      await builder.setGossipSourceRgs(
        'https://rapidsync.lightningdevkit.org/testnet/snapshot',
      );

      const node = await builder.build();
      addLog('✅ 노드 빌드 완료');

      // 3. 작
      await node.start();
      runningNode = node;

      setStatus('실행 중 (Running)');
      addLog('⚡ 노드가 시작되었습니다!');

      // 4. 노드 ID 가져오기
      const info = await node.nodeId();
      setNodeId(info.keyHex);
      addLog(`🆔 노드 ID: ${info.keyHex}`);

      await syncNode();
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e);
        addLog(`❌ 오류: ${e.message}`);
        Alert.alert('오류', e.message);
      }
    }
  };

  const syncNode = async () => {
    if (!runningNode || isSyncing) return;
    try {
      setIsSyncing(true);
      addLog('🔄 지갑 동기화 중...');
      await runningNode.syncWallets();

      // 잔액 업데이트
      const totalBalance = await runningNode.totalOnchainBalanceSats();
      const spendableBalance = await runningNode.spendableOnchainBalanceSats();
      setBalance(`${spendableBalance} / ${totalBalance} sats`);
      addLog(
        `💰 잔액: ${spendableBalance} (사용가능) / ${totalBalance} (총합)`,
      );

      const channels = await runningNode.listChannels();
      addLog(`📡 채널 수: ${channels.length}`);

      addLog('✅ 동기화 완료');
    } catch (e: unknown) {
      if (e instanceof Error) {
        addLog(`❌ 동기화 오류: ${e.message}`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const getAddress = async () => {
    if (!runningNode) {
      Alert.alert('오류', '먼저 노드를 시작해주세요.');
      return;
    }
    try {
      const addrObj: Address = await runningNode.newOnchainAddress();
      console.log('Address Object:', addrObj);
      // addrObj might be an object wrapping the string.
      // Based on Bindings.ts, Address class has addressHex property.
      const addrStr = addrObj.addressHex || addrObj.toString();
      setOnChainAddress(addrStr);
      addLog(`📬 새 주소: ${addrStr}`);

      // check if clipboard is working
      try {
        Clipboard.setString(addrStr);
        Alert.alert('주소 복사됨', '클립보드에 복사되었습니다.');
      } catch (e) {
        console.log('Clipboard error', e);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        addLog(`❌ 주소 생성 실패: ${e.message}`);
      }
    }
  };

  const receivePayment = async () => {
    if (!runningNode) return;
    try {
      addLog('💸 1000 sats 인보이스 생성 중...');
      // receivePayment takes amount in msats. 1 sat = 1000 msats.
      const amountMsat = 1000 * 1000;
      const expirySecs = 3600;
      const description = 'BoltZap Test Invoice';

      const inv = await runningNode.receivePayment(
        amountMsat,
        description,
        expirySecs,
      );
      setInvoice(inv);
      addLog(`🧾 인보이스 생성 완료!`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        addLog(`❌ 인보이스 오류: ${e.message}`);
      }
    }
  };

  return (
    <S.Container>
      <StatusBar barStyle="dark-content" />
      <S.Header>
        <S.Title>BoltZap ⚡</S.Title>
        <S.SubTitle>React Native + LDK Node</S.SubTitle>
      </S.Header>

      <S.Content>
        <S.Card>
          <S.Label>상태 (Status)</S.Label>
          <S.Value>{status}</S.Value>
        </S.Card>

        <S.Card>
          <S.Label>노드 ID</S.Label>
          <S.NodeId selectable>{nodeId}</S.NodeId>
        </S.Card>

        <S.Card>
          <S.Label>3. 온체인 지갑 (Testnet Funding)</S.Label>
          <S.Label>잔액 (Spendable / Total):</S.Label>
          <S.Value>{balance}</S.Value>

          <S.Label style={{ marginTop: 10 }}>입금 주소:</S.Label>
          <S.AddressContainer>
            <S.AddressValue selectable>
              {onChainAddress || '(버튼을 눌러 주소 생성)'}
            </S.AddressValue>
          </S.AddressContainer>

          <S.Button
            disabled={!status.includes('Running')}
            onPress={getAddress}
            style={{ marginTop: 10 }}
            variant="secondary"
          >
            <S.ButtonText variant="secondary">새 주소 발급</S.ButtonText>
          </S.Button>
        </S.Card>

        {invoice ? (
          <S.Card>
            <S.Label>인보이스 (복사해서 지불하세요)</S.Label>
            <S.Invoice selectable>{invoice}</S.Invoice>
          </S.Card>
        ) : null}

        <S.ButtonContainer>
          <S.Button onPress={initNode} disabled={status.includes('Running')}>
            <S.ButtonText variant="primary">
              {status.includes('Running')
                ? '노드 실행 중'
                : '노드 시작 (Start Node)'}
            </S.ButtonText>
          </S.Button>

          <S.Button
            variant="secondary"
            onPress={syncNode}
            disabled={!status.includes('Running') || isSyncing}
          >
            <S.ButtonText variant="secondary">
              {isSyncing ? '동기화 중...' : '동기화 (Sync)'}
            </S.ButtonText>
          </S.Button>

          <S.Button
            variant="success"
            onPress={receivePayment}
            disabled={!status.includes('Running')}
          >
            <S.ButtonText variant="primary">1000 Sats 받기</S.ButtonText>
          </S.Button>
        </S.ButtonContainer>

        <S.Logs>
          <S.LogTitle>로그 (Logs):</S.LogTitle>
          {logs.map((log, i) => (
            <S.LogText key={i}>{log}</S.LogText>
          ))}
        </S.Logs>
      </S.Content>
    </S.Container>
  );
};

export default App;
